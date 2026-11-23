//! Token swaps on Robinhood Chain through the KyberSwap aggregator, which routes across the
//! chain's DEXes (Uniswap V2/V3/V4, PancakeSwap, Aerodrome, ...).
//!
//! `swap_quote` only reads. `swap_tokens` never signs: it asks the user's wallet, through
//! Wrangl's signing page, for an exact-amount approval when one is missing and then for the
//! swap itself. Router addresses from the API are checked against KyberSwap's known router.

use std::time::Duration;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::client::{rpc_batch, Sources};
use super::tools::{decode_string, decode_u64, format_units, hex_to_decimal, parse_address};

/// KyberSwap's aggregator API for Robinhood Chain.
pub const KYBER_API: &str = "https://aggregator-api.kyberswap.com/robinhood/api/v1";
/// KyberSwap's MetaAggregationRouterV2, the only router Wrangl lets a swap go to.
pub const KYBER_ROUTERS: &[&str] = &["0x6131b5fae19ea4f9d964eac0408e4408b66337b5"];
/// The address aggregators use for the chain's native ETH.
pub const NATIVE: &str = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const DEFAULT_SLIPPAGE_BPS: u32 = 50;
const MAX_SLIPPAGE_BPS: u32 = 500;
/// Above this the quote and the signing page carry a warning.
const HIGH_IMPACT_PERCENT: f64 = 3.0;

const SEL_ALLOWANCE: &str = "dd62ed3e"; // allowance(address,address)
const SEL_APPROVE: &str = "095ea7b3"; // approve(address,uint256)

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct SwapQuoteInput {
    /// Token to sell: a contract address, or "ETH" for native ETH.
    pub token_in: String,
    /// Token to buy: a contract address, or "ETH" for native ETH.
    pub token_out: String,
    /// How much `token_in` to sell, in whole tokens as a decimal string (for example "25.5").
    pub amount: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct SwapTokensInput {
    /// Token to sell: a contract address, or "ETH" for native ETH.
    pub token_in: String,
    /// Token to buy: a contract address, or "ETH" for native ETH.
    pub token_out: String,
    /// How much `token_in` to sell, in whole tokens as a decimal string (for example "25.5").
    pub amount: String,
    /// Maximum price movement accepted, in percent. Default 0.5, at most 5.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slippage_percent: Option<f64>,
}

pub const QUOTE_DESCRIPTION: &str = "Price a token swap on Robinhood Chain (chain id 4663) \
through the KyberSwap aggregator, which routes across the chain's DEXes. Returns the amount out, \
USD values, price impact and the DEXes used. Read-only: nothing is signed or sent, no wallet \
needed. Use \"ETH\" for native ETH. Check unknown tokens with chain_token first.";

pub const SWAP_DESCRIPTION: &str = "Swap tokens on Robinhood Chain from the user's connected \
wallet, through KyberSwap. If the token needs an approval, Wrangl first asks the user to approve \
exactly this amount (never unlimited) and waits for it to confirm; then it asks the user to sign \
the swap. Both appear on Wrangl's signing page and in the user's own wallet; nothing is sent \
without their click. Slippage defaults to 0.5% (at most 5%). Quote with swap_quote and tell the \
user the expected result before calling this. The wallet address is sent to KyberSwap to build \
the route. Never ask for a private key or seed phrase.";

/// A token as the swap tools need it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    /// Lowercase address, or `NATIVE`.
    pub address: String,
    pub symbol: String,
    pub decimals: u32,
}

impl Token {
    #[must_use]
    pub fn is_native(&self) -> bool {
        self.address == NATIVE
    }
}

/// A whole-token decimal amount ("25.5") in base units. At most `decimals` decimals.
pub fn parse_units(input: &str, decimals: u32) -> Result<u128, String> {
    let input = input.trim();
    let err = || format!("`{input}` is not an amount like 25.5");
    let (whole, fraction) = input.split_once('.').unwrap_or((input, ""));
    if (whole.is_empty() && fraction.is_empty())
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(err());
    }
    let places = decimals as usize;
    if fraction.len() > places {
        return Err(format!("`{input}` has more than {decimals} decimals"));
    }
    let digits = format!("{whole}{fraction:0<places$}");
    let significant = digits.trim_start_matches('0');
    if significant.is_empty() {
        return Err("the amount must be more than zero".into());
    }
    significant
        .parse()
        .map_err(|_| format!("`{input}` is too large"))
}

fn word(value: u128) -> String {
    format!("{value:064x}")
}

fn address_word(address: &str) -> String {
    format!("{:0>64}", address.trim_start_matches("0x"))
}

/// Calldata for `approve(spender, amount)`.
#[must_use]
pub fn approve_calldata(spender: &str, amount: u128) -> String {
    format!("0x{SEL_APPROVE}{}{}", address_word(spender), word(amount))
}

fn allowance_calldata(owner: &str, spender: &str) -> String {
    format!(
        "0x{SEL_ALLOWANCE}{}{}",
        address_word(owner),
        address_word(spender)
    )
}

/// `"ETH"` / the native placeholder, or a checked contract address.
fn token_address(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.eq_ignore_ascii_case("eth") || trimmed.eq_ignore_ascii_case(NATIVE) {
        return Ok(NATIVE.to_string());
    }
    parse_address(trimmed)
}

/// Symbol and decimals of a token, read from the chain.
pub async fn resolve_token(sources: &Sources, input: &str) -> Result<Token, String> {
    let address = token_address(input)?;
    if address == NATIVE {
        return Ok(Token {
            address,
            symbol: "ETH".into(),
            decimals: 18,
        });
    }
    let call =
        |selector: &str| json!([{ "to": address, "data": format!("0x{selector}") }, "latest"]);
    let replies = rpc_batch(
        sources,
        &[
            ("eth_call", call(super::tools::SEL_DECIMALS)),
            ("eth_call", call(super::tools::SEL_SYMBOL)),
        ],
    )
    .await?;
    let decimals = replies[0]
        .as_ref()
        .ok()
        .and_then(Value::as_str)
        .and_then(decode_u64)
        .and_then(|d| u32::try_from(d).ok())
        .filter(|d| *d <= 36)
        .ok_or_else(|| format!("{address} is not an ERC-20 token (no decimals())"))?;
    let symbol = replies[1]
        .as_ref()
        .ok()
        .and_then(Value::as_str)
        .and_then(decode_string)
        .unwrap_or_else(|| "token".into());
    Ok(Token {
        address,
        symbol,
        decimals,
    })
}

/// The KyberSwap API, at a base URL tests can point elsewhere.
#[derive(Debug, Clone)]
pub struct Kyber {
    base: String,
}

impl Default for Kyber {
    fn default() -> Self {
        Self::new(KYBER_API)
    }
}

/// A priced route.
#[derive(Debug, Clone)]
pub struct Route {
    /// KyberSwap's route summary, passed back unchanged to build the transaction.
    pub summary: Value,
    pub router: String,
    pub amount_out: String,
    pub amount_in_usd: Option<f64>,
    pub amount_out_usd: Option<f64>,
    pub gas: Option<String>,
    pub dexes: Vec<String>,
}

impl Route {
    /// How much value the trade loses to the pools, in percent (from the USD values).
    #[must_use]
    pub fn price_impact_percent(&self) -> Option<f64> {
        match (self.amount_in_usd, self.amount_out_usd) {
            (Some(i), Some(o)) if i > 0.0 => Some(((i - o) / i * 100.0).max(0.0)),
            _ => None,
        }
    }
}

fn check_router(router: &str) -> Result<String, String> {
    let lower = router.to_lowercase();
    if KYBER_ROUTERS.contains(&lower.as_str()) {
        Ok(lower)
    } else {
        Err(format!(
            "the aggregator answered with an unknown router {router}; refusing to use it"
        ))
    }
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("wrangl/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

fn number(v: &Value) -> Option<f64> {
    v.as_str()
        .and_then(|s| s.parse().ok())
        .or_else(|| v.as_f64())
}

fn kyber_data(body: Value) -> Result<Value, String> {
    if body["code"].as_i64() == Some(0) {
        Ok(body["data"].clone())
    } else {
        Err(format!(
            "KyberSwap: {}",
            body["message"].as_str().unwrap_or("no route")
        ))
    }
}

impl Kyber {
    #[must_use]
    pub fn new(base: impl Into<String>) -> Self {
        Self { base: base.into() }
    }

    /// The best route for selling `amount_in` base units of `from` for `to`.
    pub async fn route(&self, from: &Token, to: &Token, amount_in: u128) -> Result<Route, String> {
        let body: Value = http()?
            .get(format!("{}/routes", self.base))
            .header("x-client-id", "wrangl")
            .query(&[
                ("tokenIn", from.address.as_str()),
                ("tokenOut", to.address.as_str()),
                ("amountIn", &amount_in.to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("could not reach KyberSwap: {}", e.without_url()))?
            .json()
            .await
            .map_err(|e| format!("KyberSwap sent a bad answer: {e}"))?;
        let data = kyber_data(body)?;
        let summary = data["routeSummary"].clone();
        let router = check_router(data["routerAddress"].as_str().unwrap_or_default())?;
        let mut dexes: Vec<String> = summary["route"]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|hop| hop.as_array().cloned().unwrap_or_default())
            .filter_map(|step| step["exchange"].as_str().map(str::to_string))
            .collect();
        dexes.dedup();
        Ok(Route {
            amount_out: summary["amountOut"].as_str().unwrap_or("0").to_string(),
            amount_in_usd: number(&summary["amountInUsd"]),
            amount_out_usd: number(&summary["amountOutUsd"]),
            gas: summary["gas"].as_str().map(str::to_string),
            dexes,
            router,
            summary,
        })
    }

    /// The swap transaction for `route`, from and to `wallet`.
    pub async fn build(
        &self,
        route: &Route,
        wallet: &str,
        slippage_bps: u32,
    ) -> Result<BuiltSwap, String> {
        let body: Value = http()?
            .post(format!("{}/route/build", self.base))
            .header("x-client-id", "wrangl")
            .json(&json!({
                "routeSummary": route.summary,
                "sender": wallet,
                "recipient": wallet,
                "slippageTolerance": slippage_bps,
            }))
            .send()
            .await
            .map_err(|e| format!("could not reach KyberSwap: {}", e.without_url()))?
            .json()
            .await
            .map_err(|e| format!("KyberSwap sent a bad answer: {e}"))?;
        let data = kyber_data(body)?;
        let router = check_router(data["routerAddress"].as_str().unwrap_or_default())?;
        let calldata = data["data"]
            .as_str()
            .filter(|d| d.starts_with("0x") && d.len() > 10)
            .ok_or("KyberSwap sent no transaction data")?
            .to_string();
        let value: u128 = data["transactionValue"]
            .as_str()
            .unwrap_or("0")
            .parse()
            .map_err(|_| "KyberSwap sent a bad transaction value")?;
        Ok(BuiltSwap {
            router,
            calldata,
            value_wei: value,
            amount_out: data["amountOut"]
                .as_str()
                .unwrap_or(&route.amount_out)
                .to_string(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct BuiltSwap {
    pub router: String,
    pub calldata: String,
    pub value_wei: u128,
    pub amount_out: String,
}

/// Minimum received after `slippage_bps`.
#[must_use]
pub fn min_out(amount_out: &str, slippage_bps: u32) -> String {
    let keep = u128::from(10_000 - slippage_bps.min(10_000));
    amount_out
        .parse::<u128>()
        .map(|out| {
            out.checked_mul(keep)
                .map_or(out / 10_000 * keep, |x| x / 10_000)
                .to_string()
        })
        .unwrap_or_else(|_| amount_out.to_string())
}

fn slippage_bps(percent: Option<f64>) -> Result<u32, String> {
    let Some(percent) = percent else {
        return Ok(DEFAULT_SLIPPAGE_BPS);
    };
    if percent.is_nan() || percent <= 0.0 {
        return Err("slippage must be more than 0%".into());
    }
    let bps = (percent * 100.0).round();
    if bps > f64::from(MAX_SLIPPAGE_BPS) {
        return Err(format!(
            "slippage {percent}% is too high; Wrangl allows at most {}%",
            MAX_SLIPPAGE_BPS / 100
        ));
    }
    Ok(bps.max(1.0) as u32)
}

fn quote_json(from: &Token, to: &Token, amount_in: u128, route: &Route) -> Value {
    let impact = route.price_impact_percent();
    let mut out = json!({
        "sell": { "token": from.symbol, "address": from.address, "amount": format_units(&amount_in.to_string(), from.decimals) },
        "buy": { "token": to.symbol, "address": to.address, "amount": format_units(&route.amount_out, to.decimals) },
        "amount_in_usd": route.amount_in_usd,
        "amount_out_usd": route.amount_out_usd,
        "price_impact_percent": impact.map(|p| (p * 100.0).round() / 100.0),
        "dexes": route.dexes,
        "gas": route.gas,
        "aggregator": "KyberSwap",
    });
    if impact.is_some_and(|p| p > HIGH_IMPACT_PERCENT) {
        out["warning"] = json!(format!(
            "price impact is above {HIGH_IMPACT_PERCENT}%: the pools are thin for this size"
        ));
    }
    out
}

/// `swap_quote`.
pub async fn quote(
    sources: &Sources,
    kyber: &Kyber,
    input: SwapQuoteInput,
) -> Result<Value, String> {
    let from = resolve_token(sources, &input.token_in).await?;
    let to = resolve_token(sources, &input.token_out).await?;
    if from.address == to.address {
        return Err("token_in and token_out are the same token".into());
    }
    let amount_in = parse_units(&input.amount, from.decimals)?;
    let route = kyber.route(&from, &to, amount_in).await?;
    Ok(quote_json(&from, &to, amount_in, &route))
}

/// What `swap_tokens` needs from the user's wallet, so tests can stand in for Wrangl.
#[allow(async_fn_in_trait)]
pub trait SwapWallet {
    /// The connected address, or `None`.
    async fn address(&self) -> Result<Option<String>, String>;
    /// Propose a transaction and wait for the user: `{status, hash?}`.
    async fn propose(
        &self,
        to: &str,
        value_wei: u128,
        data: &str,
        description: &str,
    ) -> Result<Value, String>;
}

async fn allowance(
    sources: &Sources,
    token: &str,
    owner: &str,
    spender: &str,
) -> Result<u128, String> {
    let mut replies = rpc_batch(
        sources,
        &[(
            "eth_call",
            json!([{ "to": token, "data": allowance_calldata(owner, spender) }, "latest"]),
        )],
    )
    .await?;
    let reply = replies.pop().unwrap_or(Err("no reply".into()))?;
    let decimal = reply
        .as_str()
        .and_then(hex_to_decimal)
        .ok_or("could not read the allowance")?;
    // Above u128 is "effectively unlimited" for this purpose.
    Ok(decimal.parse().unwrap_or(u128::MAX))
}

/// Wait until `hash` is mined. `Ok(true)` when it succeeded.
async fn wait_for_receipt(
    sources: &Sources,
    hash: &str,
    timeout: Duration,
    poll: Duration,
) -> Result<bool, String> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        let mut replies =
            rpc_batch(sources, &[("eth_getTransactionReceipt", json!([hash]))]).await?;
        if let Some(Ok(receipt)) = replies.pop() {
            if !receipt.is_null() {
                return Ok(receipt["status"] == "0x1");
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(format!("{hash} did not confirm in time"));
        }
        tokio::time::sleep(poll).await;
    }
}

/// How long `swap_tokens` waits for its approval to confirm, and how often it looks.
#[derive(Debug, Clone, Copy)]
pub struct Waits {
    pub approval_timeout: Duration,
    pub poll: Duration,
}

impl Default for Waits {
    fn default() -> Self {
        Self {
            approval_timeout: Duration::from_secs(180),
            poll: Duration::from_secs(2),
        }
    }
}

/// `swap_tokens`.
pub async fn swap(
    sources: &Sources,
    kyber: &Kyber,
    wallet: &impl SwapWallet,
    input: SwapTokensInput,
    waits: Waits,
) -> Result<Value, String> {
    let owner = wallet
        .address()
        .await?
        .ok_or(crate::wallet::propose::NOT_CONNECTED)?;
    let slippage = slippage_bps(input.slippage_percent)?;
    let from = resolve_token(sources, &input.token_in).await?;
    let to = resolve_token(sources, &input.token_out).await?;
    if from.address == to.address {
        return Err("token_in and token_out are the same token".into());
    }
    let amount_in = parse_units(&input.amount, from.decimals)?;
    let route = kyber.route(&from, &to, amount_in).await?;
    let sell = format!(
        "{} {}",
        format_units(&amount_in.to_string(), from.decimals),
        from.symbol
    );

    let mut approval = Value::Null;
    if !from.is_native() {
        let current = allowance(sources, &from.address, &owner, &route.router).await?;
        if current < amount_in {
            let answer = wallet
                .propose(
                    &from.address,
                    0,
                    &approve_calldata(&route.router, amount_in),
                    &format!("Allow KyberSwap to spend exactly {sell} for this swap"),
                )
                .await?;
            if answer["status"] != "sent" {
                return Ok(json!({
                    "status": "approval_not_signed",
                    "approval": answer,
                    "next": "The user did not approve, so no swap was proposed. Do not retry unless they ask.",
                }));
            }
            let hash = answer["hash"].as_str().unwrap_or_default().to_string();
            if !wait_for_receipt(sources, &hash, waits.approval_timeout, waits.poll).await? {
                return Err(format!(
                    "the approval {hash} failed on chain; no swap was proposed"
                ));
            }
            approval = answer;
        }
    }

    // A fresh route: the price may have moved while the user approved.
    let route = kyber.route(&from, &to, amount_in).await?;
    let built = kyber.build(&route, &owner, slippage).await?;
    let receive = format_units(&built.amount_out, to.decimals);
    let minimum = format_units(&min_out(&built.amount_out, slippage), to.decimals);
    let mut description = format!(
        "Swap {sell} for about {receive} {} on KyberSwap (at least {minimum}, slippage {}%)",
        to.symbol,
        f64::from(slippage) / 100.0
    );
    if let Some(p) = route
        .price_impact_percent()
        .filter(|p| *p > HIGH_IMPACT_PERCENT)
    {
        description.push_str(&format!(". Price impact {p:.1}%"));
    }
    let answer = wallet
        .propose(
            &built.router,
            built.value_wei,
            &built.calldata,
            &description,
        )
        .await?;
    Ok(json!({
        "status": answer["status"],
        "swap": answer,
        "approval": approval,
        "quote": quote_json(&from, &to, amount_in, &route),
        "minimum_received": format!("{minimum} {}", to.symbol),
    }))
}
