//! What a wallet holds on Robinhood Chain and what it is worth, plus market data for the
//! watchlist.
//!
//! There is no keyless API that lists a wallet's tokens (the explorer sits behind a bot check),
//! so the portfolio checks a known set of tokens: the ones in the chain's most traded pools on
//! GeckoTerminal, plus any the user watches. Balances come from the RPC in batches; prices from
//! GeckoTerminal (or CoinGecko with the user's key).

use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use super::client::{market_get_root, rpc_batch, Sources};
use super::tools::{
    call_with_address, decode_string, decode_u64, format_units, hex_to_decimal, parse_address,
    MARKET_NETWORK, SEL_BALANCE_OF, SEL_DECIMALS, SEL_NAME, SEL_SYMBOL,
};

/// Pages of top pools read for the token set (20 pools a page).
const POOL_PAGES: u32 = 3;
/// Token addresses per price request (GeckoTerminal's limit is 30).
const PRICE_CHUNK: usize = 30;
/// `balanceOf` calls per RPC batch.
const BALANCE_CHUNK: usize = 40;
/// Wrapped ETH: native ETH is priced as this token.
pub const WETH: &str = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
/// GeckoTerminal lists native ETH as the zero address; it is the wallet's ETH balance instead.
const ZERO: &str = "0x0000000000000000000000000000000000000000";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TokenInfo {
    /// Lowercase contract address.
    pub address: String,
    pub symbol: String,
    pub name: String,
    pub decimals: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub usd: Option<f64>,
    pub change24h: Option<f64>,
}

/// One line of the portfolio. `address` is `None` for native ETH.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Holding {
    pub address: Option<String>,
    pub symbol: String,
    pub name: String,
    /// Whole tokens, as a decimal string.
    pub amount: String,
    pub price_usd: Option<f64>,
    pub value_usd: Option<f64>,
    pub change24h: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Portfolio {
    pub address: String,
    pub holdings: Vec<Holding>,
    pub total_usd: f64,
    /// What the holdings gained or lost in USD over 24 hours, at today's amounts.
    pub change24h_usd: f64,
    /// How many tokens were checked, so the UI can say the list may be incomplete.
    pub tokens_checked: usize,
    pub rpc: &'static str,
}

/// Market facts for a watched token.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Market {
    pub address: String,
    pub symbol: Option<String>,
    pub name: Option<String>,
    pub price_usd: Option<f64>,
    pub change24h: Option<f64>,
    pub fdv_usd: Option<f64>,
    pub liquidity_usd: Option<f64>,
    pub volume24h_usd: Option<f64>,
}

fn number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
    .filter(|x: &f64| x.is_finite())
}

/// The tokens in a GeckoTerminal pools page fetched with `include=base_token,quote_token`.
#[must_use]
pub fn tokens_in_pools(body: &Value) -> Vec<TokenInfo> {
    let prefix = format!("{MARKET_NETWORK}_");
    body["included"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"] == "token")
        .filter_map(|item| {
            let a = &item["attributes"];
            let address = a["address"]
                .as_str()
                .map(str::to_string)
                .or_else(|| {
                    item["id"]
                        .as_str()?
                        .strip_prefix(&prefix)
                        .map(str::to_string)
                })?
                .to_lowercase();
            if address == ZERO {
                return None;
            }
            Some(TokenInfo {
                symbol: a["symbol"].as_str().unwrap_or("?").to_string(),
                name: a["name"].as_str().unwrap_or("").to_string(),
                decimals: a["decimals"].as_u64().and_then(|d| u32::try_from(d).ok()),
                address,
            })
        })
        .collect()
}

/// Prices from `simple/networks/…/token_price/…?include_24hr_price_change=true`, by address.
#[must_use]
pub fn simple_prices(body: &Value) -> HashMap<String, Price> {
    let a = &body["data"]["attributes"];
    a["token_prices"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(address, price)| {
            let address = address.to_lowercase();
            let change = number(&a["h24_price_change_percentage"][&address]);
            (
                address,
                Price {
                    usd: number(price),
                    change24h: change,
                },
            )
        })
        .collect()
}

/// Market facts from `networks/…/tokens/multi/…`.
#[must_use]
pub fn tokens_multi(body: &Value) -> Vec<Market> {
    body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let a = &item["attributes"];
            Some(Market {
                address: a["address"].as_str()?.to_lowercase(),
                symbol: a["symbol"].as_str().map(str::to_string),
                name: a["name"].as_str().map(str::to_string),
                price_usd: number(&a["price_usd"]),
                change24h: None,
                fdv_usd: number(&a["fdv_usd"]),
                liquidity_usd: number(&a["total_reserve_in_usd"]),
                volume24h_usd: number(&a["volume_usd"]["h24"]),
            })
        })
        .collect()
}

/// Put holdings together: drop empty balances, price them, biggest value first.
#[must_use]
pub fn assemble(
    address: String,
    eth_wei: Option<&str>,
    balances: &[(TokenInfo, String)],
    prices: &HashMap<String, Price>,
    tokens_checked: usize,
    rpc: &'static str,
) -> Portfolio {
    let mut holdings = Vec::new();
    let line = |address: Option<String>, symbol: &str, name: &str, amount: String, price: Price| {
        let qty: f64 = amount.parse().unwrap_or(0.0);
        Holding {
            address,
            symbol: symbol.to_string(),
            name: name.to_string(),
            value_usd: price.usd.map(|p| p * qty),
            price_usd: price.usd,
            change24h: price.change24h,
            amount,
        }
    };
    if let Some(wei) = eth_wei.filter(|w| *w != "0") {
        let price = prices.get(WETH).copied().unwrap_or_default();
        holdings.push(line(None, "ETH", "Ether", format_units(wei, 18), price));
    }
    for (token, raw) in balances {
        if raw == "0" {
            continue;
        }
        let Some(decimals) = token.decimals else {
            continue;
        };
        let price = prices.get(&token.address).copied().unwrap_or_default();
        holdings.push(line(
            Some(token.address.clone()),
            &token.symbol,
            &token.name,
            format_units(raw, decimals),
            price,
        ));
    }
    holdings.sort_by(|a, b| {
        b.value_usd
            .unwrap_or(-1.0)
            .total_cmp(&a.value_usd.unwrap_or(-1.0))
    });
    let total_usd = holdings.iter().filter_map(|h| h.value_usd).sum();
    // value now = value then × (1 + change); the change in USD is the difference.
    let change24h_usd = holdings
        .iter()
        .filter_map(|h| {
            let (value, pct) = (h.value_usd?, h.change24h?);
            let before = value / (1.0 + pct / 100.0);
            Some(value - before)
        })
        .sum();
    Portfolio {
        address,
        holdings,
        total_usd,
        change24h_usd,
        tokens_checked,
        rpc,
    }
}

/// Market answers are reused for this long, so the page, the alert check and the portfolio do
/// not each ask GeckoTerminal (about 30 requests a minute per IP).
const MARKET_FRESH: Duration = Duration::from_secs(30);
/// When the market API refuses (rate limit, outage), an answer this old is still shown.
const MARKET_STALE_OK: Duration = Duration::from_secs(10 * 60);

/// What [`cached_market`] keeps: path → when it was read, and the answer.
type MarketCache = HashMap<String, (Instant, Value)>;

/// `market_get_root`, through a short cache that also covers for refusals.
async fn cached_market(sources: &Sources, path: &str) -> Result<Value, String> {
    static CACHE: Mutex<Option<MarketCache>> = Mutex::new(None);
    let cached = CACHE
        .lock()
        .ok()
        .and_then(|c| c.as_ref().and_then(|m| m.get(path).cloned()));
    if let Some((at, body)) = &cached {
        if at.elapsed() < MARKET_FRESH {
            return Ok(body.clone());
        }
    }
    match market_get_root(sources, path).await {
        Ok(body) => {
            if let Ok(mut c) = CACHE.lock() {
                let map = c.get_or_insert_with(HashMap::new);
                map.retain(|_, (at, _)| at.elapsed() < MARKET_STALE_OK);
                map.insert(path.to_string(), (Instant::now(), body.clone()));
            }
            Ok(body)
        }
        Err(e) => match cached {
            Some((at, body)) if at.elapsed() < MARKET_STALE_OK => {
                log::warn!(
                    "[portfolio] {e}; showing data from {}s ago",
                    at.elapsed().as_secs()
                );
                Ok(body)
            }
            _ => Err(e),
        },
    }
}

/// The top-pool token list is read again after this long.
const TOP_TOKENS_FRESH: Duration = Duration::from_secs(10 * 60);

/// [`top_tokens`], remembered for a few minutes so refreshing the portfolio stays cheap.
pub async fn top_tokens_cached(sources: &Sources) -> Result<Vec<TokenInfo>, String> {
    static CACHE: Mutex<Option<(Instant, Vec<TokenInfo>)>> = Mutex::new(None);
    if let Ok(guard) = CACHE.lock() {
        if let Some((at, tokens)) = guard.as_ref() {
            if at.elapsed() < TOP_TOKENS_FRESH {
                return Ok(tokens.clone());
            }
        }
    }
    let tokens = top_tokens(sources).await?;
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some((Instant::now(), tokens.clone()));
    }
    Ok(tokens)
}

/// The tokens in the chain's most traded pools.
pub async fn top_tokens(sources: &Sources) -> Result<Vec<TokenInfo>, String> {
    let mut seen = BTreeMap::new();
    let mut last_error = None;
    for page in 1..=POOL_PAGES {
        let path =
            format!("networks/{MARKET_NETWORK}/pools?page={page}&include=base_token,quote_token");
        match cached_market(sources, &path).await {
            Ok(body) => {
                for t in tokens_in_pools(&body) {
                    seen.entry(t.address.clone()).or_insert(t);
                }
            }
            Err(e) => last_error = Some(e),
        }
    }
    if seen.is_empty() {
        if let Some(e) = last_error {
            return Err(e);
        }
    }
    Ok(seen.into_values().collect())
}

/// USD prices and 24h changes for `addresses`.
pub async fn prices(sources: &Sources, addresses: &[String]) -> HashMap<String, Price> {
    let mut out = HashMap::new();
    for chunk in addresses.chunks(PRICE_CHUNK) {
        let path = format!(
            "simple/networks/{MARKET_NETWORK}/token_price/{}?include_24hr_price_change=true",
            chunk.join(",")
        );
        match cached_market(sources, &path).await {
            Ok(body) => out.extend(simple_prices(&body)),
            Err(e) => log::warn!("[portfolio] prices: {e}"),
        }
    }
    out
}

/// Market facts for `addresses`, with the 24h change from the price endpoint.
pub async fn markets(sources: &Sources, addresses: &[String]) -> Result<Vec<Market>, String> {
    let mut out = Vec::new();
    for chunk in addresses.chunks(PRICE_CHUNK) {
        let path = format!("networks/{MARKET_NETWORK}/tokens/multi/{}", chunk.join(","));
        out.extend(tokens_multi(&cached_market(sources, &path).await?));
    }
    let changes = prices(sources, addresses).await;
    for m in &mut out {
        if let Some(p) = changes.get(&m.address) {
            m.change24h = p.change24h;
            m.price_usd = m.price_usd.or(p.usd);
        }
    }
    Ok(out)
}

/// Symbol, name and decimals read from the token contract itself.
pub async fn token_info(sources: &Sources, address: &str) -> Result<TokenInfo, String> {
    let address = parse_address(address)?.to_lowercase();
    let call = |sel: &str| {
        (
            "eth_call",
            json!([{ "to": address, "data": format!("0x{sel}") }, "latest"]),
        )
    };
    let replies = rpc_batch(
        sources,
        &[call(SEL_SYMBOL), call(SEL_NAME), call(SEL_DECIMALS)],
    )
    .await?;
    let text = |i: usize| {
        replies[i]
            .as_ref()
            .ok()
            .and_then(Value::as_str)
            .and_then(decode_string)
    };
    let decimals = replies[2]
        .as_ref()
        .ok()
        .and_then(Value::as_str)
        .and_then(decode_u64)
        .and_then(|d| u32::try_from(d).ok());
    let Some(symbol) = text(0) else {
        return Err(format!("{address} does not look like a token (no symbol)"));
    };
    Ok(TokenInfo {
        name: text(1).unwrap_or_default(),
        symbol,
        decimals,
        address,
    })
}

/// What `owner` holds among `tokens` (plus ETH), priced.
pub async fn portfolio(
    sources: &Sources,
    owner: &str,
    tokens: Vec<TokenInfo>,
) -> Result<Portfolio, String> {
    let owner = parse_address(owner)?;
    let eth = rpc_batch(sources, &[("eth_getBalance", json!([owner, "latest"]))]).await?;
    let eth_wei = eth[0]
        .as_ref()
        .map_err(|e| format!("eth_getBalance failed: {e}"))?
        .as_str()
        .and_then(hex_to_decimal);

    let mut balances = Vec::new();
    for chunk in tokens.chunks(BALANCE_CHUNK) {
        let calls: Vec<(&str, Value)> = chunk
            .iter()
            .map(|t| {
                (
                    "eth_call",
                    json!([{ "to": t.address, "data": call_with_address(SEL_BALANCE_OF, &owner) }, "latest"]),
                )
            })
            .collect();
        let replies = rpc_batch(sources, &calls).await?;
        for (token, reply) in chunk.iter().zip(replies) {
            if let Some(raw) = reply
                .ok()
                .as_ref()
                .and_then(Value::as_str)
                .and_then(hex_to_decimal)
            {
                balances.push((token.clone(), raw));
            }
        }
    }

    let mut priced: Vec<String> = balances
        .iter()
        .filter(|(_, raw)| raw != "0")
        .map(|(t, _)| t.address.clone())
        .collect();
    if eth_wei.as_deref().is_some_and(|w| w != "0") {
        priced.push(WETH.to_string());
    }
    let prices = prices(sources, &priced).await;
    Ok(assemble(
        owner,
        eth_wei.as_deref(),
        &balances,
        &prices,
        tokens.len(),
        sources.rpc_label(),
    ))
}
