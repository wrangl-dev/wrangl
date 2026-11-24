//! Research tools for Robinhood Chain's trenches: finding tokens and pools, launches per
//! launchpad, pool stats and trades, price candles, token profiles (holders, developer, socials),
//! Pons bonding-curve launches and what a developer launched before, and a one-shot token report
//! with risk flags.
//!
//! Market data is GeckoTerminal's `robinhood` network (through the shared 30-second cache, since
//! it allows about 30 requests a minute). Launch history is read from the chain's logs, which only
//! the official public RPC serves far back; where that RPC is blocked the tools say so.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::client::{market_cached, rpc_batch, Endpoint, Sources};
use super::tools::{decode_u64, hex_to_decimal, parse_address, MARKET_NETWORK, PUBLIC_RPC_URL};

/// The Pons launcher, and its launch event: topics are [event, token, curve pool, creator].
pub const PONS_LAUNCHER: &str = "0xe33e9e479df8802cb0866d5d05258bec4cf62948";
pub const PONS_LAUNCH_TOPIC: &str =
    "0xdcacba5e347ae7abd91cb519eb877af8fa7774e347b85dd3ddcd24a2ba8cdf37";
/// Pons launches start after this block.
const PONS_FIRST_BLOCK: u64 = 27_000_000;
/// The official RPC serves at most this many blocks (and 10,000 logs) per `eth_getLogs`.
const LOG_SPAN: u64 = 9_999_999;
const DEAD: &str = "0x000000000000000000000000000000000000dead";
const SEL_TOTAL_SUPPLY: &str = "18160ddd";
const SEL_BALANCE_OF: &str = "70a08231";

/// Legitscan's warning thresholds, kept here so reports read the same everywhere.
const TOP10_WARN_PCT: f64 = 50.0;
const MC_OVER_LIQUIDITY_WARN: f64 = 100.0;
const DEV_LAUNCHES_WARN: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResearchTool {
    TokenSearch,
    PoolsTrending,
    PoolsTop,
    Launchpads,
    Launches,
    PoolInfo,
    PoolTrades,
    PriceChart,
    TokenProfile,
    TokenReport,
    PonsLaunch,
    DevLaunches,
}

pub const ALL: [ResearchTool; 12] = [
    ResearchTool::TokenSearch,
    ResearchTool::PoolsTrending,
    ResearchTool::PoolsTop,
    ResearchTool::Launchpads,
    ResearchTool::Launches,
    ResearchTool::PoolInfo,
    ResearchTool::PoolTrades,
    ResearchTool::PriceChart,
    ResearchTool::TokenProfile,
    ResearchTool::TokenReport,
    ResearchTool::PonsLaunch,
    ResearchTool::DevLaunches,
];

impl ResearchTool {
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::TokenSearch => "token_search",
            Self::PoolsTrending => "pools_trending",
            Self::PoolsTop => "pools_top",
            Self::Launchpads => "launchpads",
            Self::Launches => "launches",
            Self::PoolInfo => "pool_info",
            Self::PoolTrades => "pool_trades",
            Self::PriceChart => "price_chart",
            Self::TokenProfile => "token_profile",
            Self::TokenReport => "token_report",
            Self::PonsLaunch => "pons_launch",
            Self::DevLaunches => "dev_launches",
        }
    }

    #[must_use]
    pub fn description(self) -> &'static str {
        match self {
            Self::TokenSearch => "Find Robinhood Chain tokens and pools by name, symbol or address. Returns matching pools with both token addresses, liquidity, volume, price change and age. Use it to turn a name like \"doge\" into an address before other tools.",
            Self::PoolsTrending => "The pools trending on Robinhood Chain right now (GeckoTerminal), for a window of 5m, 1h, 6h or 24h: price, change, liquidity, volume, buys and sells.",
            Self::PoolsTop => "Robinhood Chain's biggest pools by 24h volume or by 24h transactions, optionally on one launchpad or DEX (see launchpads).",
            Self::Launchpads => "Every DEX and launchpad on Robinhood Chain that GeckoTerminal tracks (Pons, Clanker, Virtuals, Bankr, Uniswap and more), with the ids the launches and pools_top tools take.",
            Self::Launches => "The newest pools on Robinhood Chain, either across all DEXes or on one launchpad (for example pons-v2, clanker-robinhood, virtuals-robinhood): name, age, liquidity, market cap, early buys and sells. New tokens are often scams: check them with token_report.",
            Self::PoolInfo => "Everything about one pool: DEX, age, price, FDV and market cap, liquidity, locked liquidity, and price change, volume, buys, sells, buyers and sellers for 5m, 15m, 30m, 1h, 6h and 24h.",
            Self::PoolTrades => "The latest trades of a pool (up to 300): buy and sell totals, unique wallets, the largest trades, the wallets that bought and sold the most, and optionally one wallet's trades. Useful to spot whales, a developer selling, or bots.",
            Self::PriceChart => "Price candles (OHLCV) of a pool by minute, hour or day, with a summary: change over the range, high, low, drop from the high, and volatility.",
            Self::TokenProfile => "A token's profile from GeckoTerminal: holder count and how concentrated holdings are (top 10, 11-30, 31-50), developer address and holding, GeckoTerminal score and verification, honeypot flag, socials, categories, launchpad progress (graduated or not), and its pools.",
            Self::TokenReport => "One call for a full token check on Robinhood Chain: contract facts (owner, renounced, mint/pause/blacklist/upgrade functions, proxy), burned supply, profile (holders, developer, socials, score), the main pool's market and trading activity, Pons launch details when it is a Pons coin, and a list of risk flags. Start research on any token here. Facts, not advice.",
            Self::PonsLaunch => "Details of a token launched on Pons (Robinhood Chain's bonding-curve launchpad): creator, curve pool, launch block, how full the curve is and whether it graduated. Needs the official RPC for old launches.",
            Self::DevLaunches => "What a wallet launched on Pons before: every launch by that creator with its token, curve and status. Serial launchers are a common rug sign. Needs the official RPC.",
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Inputs.

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchInput {
    /// A name, symbol or contract address.
    pub query: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TrendingInput {
    /// 5m, 1h, 6h or 24h. Default 24h.
    #[serde(default)]
    pub window: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TopInput {
    /// "volume" (default) or "transactions".
    #[serde(default)]
    pub by: Option<String>,
    /// A launchpad or DEX id from the launchpads tool, to rank only its pools.
    #[serde(default)]
    pub launchpad: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LaunchesInput {
    /// A launchpad or DEX id from the launchpads tool (for example pons-v2). Leave out for every DEX.
    #[serde(default)]
    pub launchpad: Option<String>,
    /// Page 1 (default) to 5, 20 pools a page.
    #[serde(default)]
    pub page: Option<u32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PoolInput {
    /// The pool address (0x and 40 hex characters, or a 64-hex Uniswap v4 pool id).
    pub pool: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TradesInput {
    /// The pool address.
    pub pool: String,
    /// Only this wallet's trades.
    #[serde(default)]
    pub wallet: Option<String>,
    /// Only trades worth at least this many USD.
    #[serde(default)]
    pub min_usd: Option<f64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ChartInput {
    /// The pool address.
    pub pool: String,
    /// "minute", "hour" (default) or "day".
    #[serde(default)]
    pub timeframe: Option<String>,
    /// Candles to return, 1 to 300. Default 48.
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TokenInput {
    /// The token contract address.
    pub token: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DevInput {
    /// The creator's wallet address.
    pub wallet: String,
}

// ---------------------------------------------------------------------------------------------
// Small helpers.

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
    .filter(|x: &f64| x.is_finite())
}

fn round(x: f64, places: i32) -> f64 {
    let f = 10f64.powi(places);
    (x * f).round() / f
}

/// A pool address or a Uniswap v4 pool id, lowercase.
pub fn parse_pool(input: &str) -> Result<String, String> {
    let s = input.trim().to_lowercase();
    let hex = s.strip_prefix("0x").unwrap_or("");
    if (hex.len() == 40 || hex.len() == 64) && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(s)
    } else {
        Err(format!(
            "{input} is not a pool address (0x and 40 or 64 hex characters)"
        ))
    }
}

/// A launchpad id as GeckoTerminal spells it: lowercase letters, digits and dashes.
fn parse_launchpad(id: &str) -> Result<String, String> {
    let id = id.trim().to_lowercase();
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        Ok(id)
    } else {
        Err(format!(
            "{id} is not a launchpad id; the launchpads tool lists them"
        ))
    }
}

/// The address part of a GeckoTerminal id like `robinhood_0xabc`.
fn id_address(id: &Value) -> Option<String> {
    let s = id.as_str()?;
    Some(
        s.strip_prefix(&format!("{MARKET_NETWORK}_"))
            .unwrap_or(s)
            .to_string(),
    )
}

fn hours_since(iso: &str, now_secs: i64) -> Option<f64> {
    let t = chrono_like_parse(iso)?;
    Some(round((now_secs - t) as f64 / 3600.0, 1))
}

/// Seconds since the epoch for `YYYY-MM-DDTHH:MM:SS…Z`, without a date library.
fn chrono_like_parse(iso: &str) -> Option<i64> {
    let b = iso.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let n = |r: std::ops::Range<usize>| iso.get(r)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, s) = (
        n(0..4)?,
        n(5..7)?,
        n(8..10)?,
        n(11..13)?,
        n(14..16)?,
        n(17..19)?,
    );
    // Days from 1970-01-01 (Howard Hinnant's algorithm).
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let doy = (153 * (mo + if mo > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + h * 3600 + mi * 60 + s)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0))
}

// ---------------------------------------------------------------------------------------------
// Pure summaries of GeckoTerminal answers (tested without the network).

/// One pool, trimmed to what research needs.
#[must_use]
pub fn pool_summary(item: &Value, now: i64) -> Value {
    let a = &item["attributes"];
    let r = &item["relationships"];
    let window = |w: &str| {
        let t = &a["transactions"][w];
        json!({
            "change_pct": num(&a["price_change_percentage"][w]),
            "volume_usd": num(&a["volume_usd"][w]).map(|v| round(v, 0)),
            "buys": t["buys"], "sells": t["sells"],
            "buyers": t["buyers"], "sellers": t["sellers"],
        })
    };
    json!({
        "pool": a["address"],
        "name": a["name"],
        "dex": r["dex"]["data"]["id"],
        "base_token": id_address(&r["base_token"]["data"]["id"]),
        "quote_token": id_address(&r["quote_token"]["data"]["id"]),
        "created_at": a["pool_created_at"],
        "age_hours": a["pool_created_at"].as_str().and_then(|t| hours_since(t, now)),
        "price_usd": num(&a["base_token_price_usd"]),
        "fdv_usd": num(&a["fdv_usd"]).map(|v| round(v, 0)),
        "market_cap_usd": num(&a["market_cap_usd"]).map(|v| round(v, 0)),
        "liquidity_usd": num(&a["reserve_in_usd"]).map(|v| round(v, 0)),
        "locked_liquidity_pct": num(&a["locked_liquidity_percentage"]),
        "m5": window("m5"),
        "h1": window("h1"),
        "h6": window("h6"),
        "h24": window("h24"),
    })
}

/// A list of pools from a GeckoTerminal pools answer.
#[must_use]
pub fn pools_list(body: &Value, now: i64) -> Vec<Value> {
    body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| pool_summary(p, now))
        .collect()
}

/// The full view of one pool, with the 15m and 30m windows too.
#[must_use]
pub fn pool_detail(body: &Value, now: i64) -> Value {
    let item = &body["data"];
    let mut out = pool_summary(item, now);
    let a = &item["attributes"];
    for w in ["m15", "m30"] {
        let t = &a["transactions"][w];
        out[w] = json!({
            "change_pct": num(&a["price_change_percentage"][w]),
            "volume_usd": num(&a["volume_usd"][w]).map(|v| round(v, 0)),
            "buys": t["buys"], "sells": t["sells"],
        });
    }
    out["quote_token_price_usd"] = json!(num(&a["quote_token_price_usd"]));
    out
}

#[derive(Debug, Default, Serialize)]
struct WalletTotal {
    wallet: String,
    bought_usd: f64,
    sold_usd: f64,
    trades: u32,
}

/// What the latest trades of a pool say.
#[must_use]
pub fn trades_summary(body: &Value, wallet: Option<&str>, min_usd: Option<f64>) -> Value {
    let wallet = wallet.map(str::to_lowercase);
    let trades: Vec<&Value> = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|t| &t["attributes"])
        .filter(|a| a["is_anomalous"] != json!(true))
        .filter(|a| {
            wallet.as_deref().is_none_or(|w| {
                a["tx_from_address"]
                    .as_str()
                    .is_some_and(|f| f.eq_ignore_ascii_case(w))
            })
        })
        .filter(|a| min_usd.is_none_or(|m| num(&a["volume_in_usd"]).unwrap_or(0.0) >= m))
        .collect();

    let mut buys = (0u32, 0.0f64);
    let mut sells = (0u32, 0.0f64);
    let mut wallets: std::collections::BTreeMap<String, WalletTotal> = Default::default();
    for a in &trades {
        let usd = num(&a["volume_in_usd"]).unwrap_or(0.0);
        let who = a["tx_from_address"].as_str().unwrap_or("?").to_lowercase();
        let w = wallets.entry(who.clone()).or_insert_with(|| WalletTotal {
            wallet: who,
            ..Default::default()
        });
        w.trades += 1;
        if a["kind"] == "buy" {
            buys.0 += 1;
            buys.1 += usd;
            w.bought_usd += usd;
        } else {
            sells.0 += 1;
            sells.1 += usd;
            w.sold_usd += usd;
        }
    }
    let trade_row = |a: &&Value| {
        json!({
            "kind": a["kind"],
            "usd": num(&a["volume_in_usd"]).map(|v| round(v, 2)),
            "wallet": a["tx_from_address"],
            "time": a["block_timestamp"],
            "tx": a["tx_hash"],
        })
    };
    let mut largest = trades.clone();
    largest.sort_by(|x, y| {
        num(&y["volume_in_usd"])
            .unwrap_or(0.0)
            .total_cmp(&num(&x["volume_in_usd"]).unwrap_or(0.0))
    });
    let mut totals: Vec<WalletTotal> = wallets.into_values().collect();
    let unique = totals.len();
    let tidy = |w: &WalletTotal| {
        json!({ "wallet": w.wallet, "bought_usd": round(w.bought_usd, 2),
                "sold_usd": round(w.sold_usd, 2), "trades": w.trades })
    };
    totals.sort_by(|a, b| b.bought_usd.total_cmp(&a.bought_usd));
    let top_buyers: Vec<Value> = totals
        .iter()
        .take(5)
        .filter(|w| w.bought_usd > 0.0)
        .map(tidy)
        .collect();
    totals.sort_by(|a, b| b.sold_usd.total_cmp(&a.sold_usd));
    let top_sellers: Vec<Value> = totals
        .iter()
        .take(5)
        .filter(|w| w.sold_usd > 0.0)
        .map(tidy)
        .collect();
    json!({
        "trades": trades.len(),
        "from": trades.last().map(|a| &a["block_timestamp"]),
        "to": trades.first().map(|a| &a["block_timestamp"]),
        "buys": buys.0, "buy_usd": round(buys.1, 2),
        "sells": sells.0, "sell_usd": round(sells.1, 2),
        "unique_wallets": unique,
        "top_buyers": top_buyers,
        "top_sellers": top_sellers,
        "largest": largest.iter().take(10).map(trade_row).collect::<Vec<_>>(),
        "latest": trades.iter().take(10).map(trade_row).collect::<Vec<_>>(),
    })
}

/// Candles oldest first, and what they say.
#[must_use]
pub fn chart_summary(body: &Value) -> Value {
    // GeckoTerminal sends [time, open, high, low, close, volume], newest first.
    let mut candles: Vec<[f64; 6]> = body["data"]["attributes"]["ohlcv_list"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| {
            let c = c.as_array()?;
            let mut row = [0.0; 6];
            for (i, v) in c.iter().take(6).enumerate() {
                row[i] = num(v)?;
            }
            Some(row)
        })
        .collect();
    candles.sort_by(|a, b| a[0].total_cmp(&b[0]));
    if candles.is_empty() {
        return json!({ "candles": [], "note": "no candles for this pool and timeframe" });
    }
    let first_open = candles[0][1];
    let last_close = candles[candles.len() - 1][4];
    let high = candles.iter().map(|c| c[2]).fold(f64::MIN, f64::max);
    let low = candles.iter().map(|c| c[3]).fold(f64::MAX, f64::min);
    let volume: f64 = candles.iter().map(|c| c[5]).sum();
    let returns: Vec<f64> = candles
        .windows(2)
        .filter(|w| w[0][4] > 0.0)
        .map(|w| w[1][4] / w[0][4] - 1.0)
        .collect();
    let volatility = if returns.len() > 1 {
        let mean = returns.iter().sum::<f64>() / returns.len() as f64;
        let var =
            returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (returns.len() - 1) as f64;
        Some(round(var.sqrt() * 100.0, 2))
    } else {
        None
    };
    json!({
        "count": candles.len(),
        "from": candles[0][0] as i64,
        "to": candles[candles.len() - 1][0] as i64,
        "change_pct": (first_open > 0.0).then(|| round((last_close / first_open - 1.0) * 100.0, 2)),
        "high": high, "low": low, "last": last_close,
        "drop_from_high_pct": (high > 0.0).then(|| round((1.0 - last_close / high) * 100.0, 2)),
        "volatility_pct_per_candle": volatility,
        "volume_usd": round(volume, 0),
        "candles": candles.iter().map(|c| json!({
            "t": c[0] as i64, "o": c[1], "h": c[2], "l": c[3], "c": c[4], "v": round(c[5], 0)
        })).collect::<Vec<_>>(),
    })
}

/// A token's profile from `tokens/{t}/info` plus the launchpad part of `tokens/multi`.
#[must_use]
pub fn profile(info: &Value, multi: Option<&Value>) -> Value {
    let a = &info["data"]["attributes"];
    let holders = &a["holders"];
    let dist = &holders["distribution_percentage"];
    let m = multi.map(|m| &m["data"][0]["attributes"]);
    json!({
        "token": a["address"],
        "name": a["name"],
        "symbol": a["symbol"],
        "holders": holders["count"],
        "holders_updated": holders["last_updated"],
        "top10_pct": num(&dist["top_10"]),
        "top11_30_pct": num(&dist["11_30"]),
        "top31_50_pct": num(&dist["31_50"]),
        "rest_pct": num(&dist["rest"]),
        "developer": a["developer_address"],
        "developer_holding_pct": num(&a["developer_holding_percentage"]),
        "gt_score": num(&a["gt_score"]).map(|v| round(v, 1)),
        "gt_score_details": a["gt_score_details"],
        "gt_verified": a["gt_verified"],
        "honeypot": a["is_honeypot"],
        "mint_authority": a["mint_authority"],
        "categories": a["categories"],
        "websites": a["websites"],
        "twitter": a["twitter_handle"],
        "telegram": a["telegram_handle"],
        "discord": a["discord_url"],
        "description": a["description"].as_str().map(|d| d.chars().take(400).collect::<String>()),
        "launchpad": m.map(|m| m["launchpad_details"].clone()),
        "market_cap_usd": m.and_then(|m| num(&m["market_cap_usd"])).map(|v| round(v, 0)),
        "fdv_usd": m.and_then(|m| num(&m["fdv_usd"])).map(|v| round(v, 0)),
    })
}

/// Facts a token report weighs.
#[derive(Debug, Default)]
pub struct RiskInputs {
    pub contract: Value,
    pub profile: Value,
    pub main_pool: Option<Value>,
    pub burned_pct: Option<f64>,
    pub dev_launches: Option<usize>,
    /// A Pons coin still on its bonding curve (the curve holds most of the supply).
    pub on_curve: bool,
}

/// Risk flags for a token, each with why. "warn" flags are worth stopping for.
#[must_use]
pub fn risk_flags(r: &RiskInputs) -> Vec<Value> {
    let mut flags = vec![];
    let mut flag = |level: &str, what: &str, why: String| {
        flags.push(json!({ "level": level, "flag": what, "why": why }));
    };
    let c = &r.contract;
    // chain_token lists privileged function signatures found in the code (and behind a proxy).
    let sigs: Vec<String> = ["code", "implementation_code"]
        .iter()
        .flat_map(|k| {
            c[k]["privileged_functions"]
                .as_array()
                .cloned()
                .unwrap_or_default()
        })
        .filter_map(|s| s.as_str().map(str::to_lowercase))
        .collect();
    let live_owner = c["ownership_renounced"] != json!(true);
    for (keys, label) in [
        (&["mint"][..], "can mint"),
        (&["pause"][..], "can pause"),
        (&["blacklist", "block"][..], "can blacklist"),
        (&["upgrade"][..], "upgradeable"),
    ] {
        if let Some(sig) = sigs.iter().find(|s| keys.iter().any(|k| s.contains(k))) {
            flag(
                if live_owner { "warn" } else { "info" },
                label,
                format!(
                    "the code has {sig}{}",
                    if live_owner {
                        " and the owner is not renounced"
                    } else {
                        "; ownership is renounced"
                    }
                ),
            );
        }
    }
    if !c["eip1967_implementation"].is_null() || !c["code"]["clone_of"].is_null() {
        flag(
            "warn",
            "proxy",
            "the token is a proxy: whoever controls it can change the code".into(),
        );
    }
    let p = &r.profile;
    if p["honeypot"] == json!(true) || p["honeypot"] == json!("yes") {
        flag(
            "warn",
            "honeypot",
            "GeckoTerminal flags it as a honeypot (you may not be able to sell)".into(),
        );
    }
    if let Some(top10) = num(&p["top10_pct"]) {
        if top10 > TOP10_WARN_PCT {
            if r.on_curve {
                // Before a Pons coin graduates, the curve contract holds most of the supply.
                flag("info", "concentrated", format!("the top 10 holders hold {top10:.1}%, but the bonding curve itself is one of them until the coin graduates"));
            } else {
                flag("warn", "concentrated", format!("the top 10 holders hold {top10:.1}% (pools and burn addresses can be among them)"));
            }
        }
    }
    if let Some(dev) = num(&p["developer_holding_pct"]) {
        if dev >= 5.0 {
            flag(
                "warn",
                "developer holds a lot",
                format!("the developer holds {dev:.1}% of supply"),
            );
        }
    }
    if let Some(n) = r.dev_launches {
        if n >= DEV_LAUNCHES_WARN {
            flag(
                "warn",
                "serial launcher",
                format!("the creator launched {n} coins on Pons"),
            );
        }
    }
    if let Some(pool) = &r.main_pool {
        let liq = num(&pool["liquidity_usd"]).unwrap_or(0.0);
        let mc = num(&pool["market_cap_usd"]).or_else(|| num(&pool["fdv_usd"]));
        if liq <= 0.0 {
            flag(
                "warn",
                "no liquidity",
                "the main pool has no liquidity".into(),
            );
        } else if let Some(mc) = mc {
            if mc / liq > MC_OVER_LIQUIDITY_WARN {
                flag(
                    "warn",
                    "thin liquidity",
                    format!(
                        "market cap is {:.0}x the liquidity: a sale moves the price a lot",
                        mc / liq
                    ),
                );
            }
        }
        if liq > 0.0 && liq < 5_000.0 {
            flag("warn", "tiny pool", format!("only ${liq:.0} of liquidity"));
        }
        if let Some(age) = num(&pool["age_hours"]) {
            if age < 24.0 {
                flag("info", "new", format!("the pool is {age:.1} hours old"));
            }
        }
        let h24 = &pool["h24"];
        if h24["buys"].as_u64().unwrap_or(0) > 20 && h24["sells"].as_u64() == Some(0) {
            flag(
                "warn",
                "no sells",
                "many buys and no sells in 24h: selling may be blocked".into(),
            );
        }
    } else {
        flag(
            "warn",
            "no pool",
            "GeckoTerminal knows no pool for this token".into(),
        );
    }
    if let Some(b) = r.burned_pct {
        if b >= 50.0 {
            flag("info", "burned", format!("{b:.1}% of supply is burned"));
        }
    }
    if p["twitter"].is_null()
        && p["telegram"].is_null()
        && p["websites"].as_array().is_none_or(Vec::is_empty)
    {
        flag(
            "info",
            "no socials",
            "no website, X or Telegram listed".into(),
        );
    }
    flags
}

// ---------------------------------------------------------------------------------------------
// Reads.

fn market(path: &str) -> String {
    format!("networks/{MARKET_NETWORK}/{path}")
}

fn parse<T: serde::de::DeserializeOwned>(input: Value) -> Result<T, String> {
    serde_json::from_value(input).map_err(|e| format!("bad input: {e}"))
}

/// The official public RPC: the only one that serves old logs (about 10 million blocks a query).
fn logs_sources(sources: &Sources) -> Sources {
    let _ = sources;
    Sources::with_endpoints(vec![Endpoint {
        url: PUBLIC_RPC_URL.to_string(),
        label: "official public RPC",
    }])
}

fn topic(address: &str) -> String {
    format!("0x{:0>64}", address.trim_start_matches("0x"))
}

/// `eth_getLogs` newest window first, until `want` logs or the first block.
async fn logs_back(
    sources: &Sources,
    filter: Value,
    from_block: u64,
    want: usize,
) -> Result<Vec<Value>, String> {
    // Where the official RPC is blocked, every lookup would wait for a timeout: after a failure,
    // skip it for a while and say so at once.
    static DOWN_UNTIL: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
    const RETRY_AFTER: std::time::Duration = std::time::Duration::from_secs(10 * 60);
    let blocked = "launch history needs the official Robinhood RPC, which does not answer from \
                   this network (some internet providers block it; a VPN helps)";
    if DOWN_UNTIL
        .lock()
        .ok()
        .and_then(|g| *g)
        .is_some_and(|until| std::time::Instant::now() < until)
    {
        return Err(blocked.into());
    }
    let logs_rpc = logs_sources(sources);
    let head = match rpc_batch(&logs_rpc, &[("eth_blockNumber", json!([]))]).await {
        Ok(h) => h,
        Err(e) => {
            if let Ok(mut g) = DOWN_UNTIL.lock() {
                *g = Some(std::time::Instant::now() + RETRY_AFTER);
            }
            return Err(format!("{blocked}: {e}"));
        }
    };
    let head = head[0]
        .as_ref()
        .ok()
        .and_then(Value::as_str)
        .and_then(decode_u64)
        .ok_or("no block number")?;
    let mut out = vec![];
    let mut to = head;
    while to > from_block && out.len() < want {
        let from = to.saturating_sub(LOG_SPAN).max(from_block);
        let mut f = filter.clone();
        f["fromBlock"] = json!(format!("0x{from:x}"));
        f["toBlock"] = json!(format!("0x{to:x}"));
        let reply = rpc_batch(&logs_rpc, &[("eth_getLogs", json!([f]))]).await?;
        let logs = reply[0]
            .clone()
            .map_err(|e| format!("eth_getLogs failed: {e}"))?;
        let mut batch = logs.as_array().cloned().unwrap_or_default();
        batch.reverse();
        out.extend(batch);
        to = from.saturating_sub(1);
    }
    out.truncate(want);
    Ok(out)
}

fn launch_row(log: &Value) -> Option<Value> {
    let t = log["topics"].as_array()?;
    if t.len() != 4 {
        return None;
    }
    let addr = |v: &Value| v.as_str().map(|s| format!("0x{}", &s[s.len() - 40..]));
    Some(json!({
        "token": addr(&t[1]),
        "curve_pool": addr(&t[2]),
        "creator": addr(&t[3]),
        "block": log["blockNumber"].as_str().and_then(decode_u64),
        "tx": log["transactionHash"],
    }))
}

/// How full a Pons curve is, from the share of supply still in the curve pool.
/// Fitted by Legitscan: filled% = (1/h - 1) / 2.5 × 100; 0 tokens left means it graduated.
#[must_use]
pub fn curve_progress(pool_balance: f64, total_supply: f64) -> Value {
    if total_supply <= 0.0 {
        return json!({ "known": false });
    }
    if pool_balance <= 0.0 {
        return json!({ "graduated": true, "filled_pct": 100.0 });
    }
    let h = (pool_balance / total_supply).min(1.0);
    let filled = ((1.0 / h - 1.0) / 2.5 * 100.0).clamp(0.0, 100.0);
    json!({ "graduated": false, "filled_pct": round(filled, 1) })
}

async fn erc20_amounts(
    sources: &Sources,
    token: &str,
    holders: &[&str],
) -> Result<(f64, Vec<f64>), String> {
    let mut calls = vec![(
        "eth_call",
        json!([{ "to": token, "data": format!("0x{SEL_TOTAL_SUPPLY}") }, "latest"]),
    )];
    for h in holders {
        calls.push(("eth_call", json!([{ "to": token, "data": format!("0x{SEL_BALANCE_OF}{}", &topic(h)[2..]) }, "latest"])));
    }
    let replies = rpc_batch(sources, &calls).await?;
    let val = |r: &Result<Value, String>| {
        r.as_ref()
            .ok()
            .and_then(Value::as_str)
            .and_then(hex_to_decimal)
            .and_then(|d| d.parse::<f64>().ok())
    };
    let supply = val(&replies[0]).ok_or("totalSupply failed")?;
    Ok((
        supply,
        replies[1..].iter().map(|r| val(r).unwrap_or(0.0)).collect(),
    ))
}

async fn pons_launch(sources: &Sources, token: &str) -> Result<Value, String> {
    let filter = json!({ "address": PONS_LAUNCHER, "topics": [PONS_LAUNCH_TOPIC, topic(token)] });
    let logs = logs_back(sources, filter, PONS_FIRST_BLOCK, 1).await?;
    let Some(row) = logs.first().and_then(launch_row) else {
        return Ok(json!({ "token": token, "pons": false, "note": "not launched on Pons" }));
    };
    let pool = row["curve_pool"].as_str().unwrap_or_default().to_string();
    let mut out = row;
    out["pons"] = json!(true);
    if let Ok((supply, held)) = erc20_amounts(sources, token, &[&pool]).await {
        out["curve"] = curve_progress(held[0], supply);
    }
    Ok(out)
}

async fn dev_launches(sources: &Sources, wallet: &str) -> Result<Value, String> {
    let wallet = parse_address(wallet)?.to_lowercase();
    let filter = json!({ "address": PONS_LAUNCHER, "topics": [PONS_LAUNCH_TOPIC, null, null, topic(&wallet)] });
    let logs = logs_back(sources, filter, PONS_FIRST_BLOCK, 200).await?;
    let launches: Vec<Value> = logs.iter().filter_map(launch_row).collect();
    // Market status of the latest 30, in one request.
    let tokens: Vec<String> = launches
        .iter()
        .take(30)
        .filter_map(|l| l["token"].as_str().map(str::to_string))
        .collect();
    let mut status = std::collections::HashMap::new();
    if !tokens.is_empty() {
        if let Ok(body) = market_cached(
            sources,
            &market(&format!("tokens/multi/{}", tokens.join(","))),
        )
        .await
        {
            for t in body["data"].as_array().into_iter().flatten() {
                let a = &t["attributes"];
                if let Some(addr) = a["address"].as_str() {
                    status.insert(
                        addr.to_lowercase(),
                        json!({
                            "symbol": a["symbol"], "name": a["name"],
                            "market_cap_usd": num(&a["market_cap_usd"]).map(|v| round(v, 0)),
                            "liquidity_usd": num(&a["total_reserve_in_usd"]).map(|v| round(v, 0)),
                            "graduated": a["launchpad_details"]["completed"],
                        }),
                    );
                }
            }
        }
    }
    let rows: Vec<Value> = launches
        .iter()
        .map(|l| {
            let mut l = l.clone();
            if let Some(s) = l["token"].as_str().and_then(|t| status.get(t)) {
                l["market"] = s.clone();
            }
            l
        })
        .collect();
    Ok(
        json!({ "wallet": wallet, "pons_launches": rows.len(), "launches": rows,
               "note": "Only Pons launches are on-chain here; launches on other launchpads are not counted." }),
    )
}

async fn token_profile(sources: &Sources, token: &str) -> Result<Value, String> {
    let token = parse_address(token)?.to_lowercase();
    let info = market_cached(sources, &market(&format!("tokens/{token}/info"))).await?;
    let multi = market_cached(sources, &market(&format!("tokens/multi/{token}")))
        .await
        .ok();
    let mut out = profile(&info, multi.as_ref());
    if let Ok(pools) =
        market_cached(sources, &market(&format!("tokens/{token}/pools?page=1"))).await
    {
        out["pools"] = json!(pools_list(&pools, now_secs())
            .into_iter()
            .take(5)
            .collect::<Vec<_>>());
    }
    Ok(out)
}

async fn token_report(sources: &Sources, token: &str) -> Result<Value, String> {
    let token = parse_address(token)?.to_lowercase();
    let contract = super::client::run(
        sources,
        super::tools::ChainTool::Token,
        json!({ "address": token, "market": false }),
    )
    .await
    .unwrap_or_else(|e| json!({ "error": e }));
    let profile = token_profile(sources, &token)
        .await
        .unwrap_or_else(|e| json!({ "error": e }));
    let main_pool = profile["pools"].as_array().and_then(|p| p.first()).cloned();
    let burned_pct = erc20_amounts(
        sources,
        &token,
        &[DEAD, "0x0000000000000000000000000000000000000000"],
    )
    .await
    .ok()
    .filter(|(s, _)| *s > 0.0)
    .map(|(supply, held)| round(held.iter().sum::<f64>() / supply * 100.0, 2));
    let activity = match main_pool.as_ref().and_then(|p| p["pool"].as_str()) {
        Some(pool) => market_cached(sources, &market(&format!("pools/{pool}/trades")))
            .await
            .map(|b| {
                let s = trades_summary(&b, None, None);
                json!({ "trades": s["trades"], "buys": s["buys"], "sells": s["sells"],
                        "buy_usd": s["buy_usd"], "sell_usd": s["sell_usd"],
                        "unique_wallets": s["unique_wallets"], "top_sellers": s["top_sellers"] })
            })
            .ok(),
        None => None,
    };
    let pons = pons_launch(sources, &token)
        .await
        .ok()
        .filter(|p| p["pons"] == json!(true));
    let dev = pons
        .as_ref()
        .and_then(|p| p["creator"].as_str().map(str::to_string))
        .or_else(|| profile["developer"].as_str().map(str::to_string));
    let dev_history = match (&pons, &dev) {
        (Some(_), Some(d)) => dev_launches(sources, d).await.ok(),
        _ => None,
    };
    let flags = risk_flags(&RiskInputs {
        contract: contract.clone(),
        profile: profile.clone(),
        main_pool: main_pool.clone(),
        burned_pct,
        dev_launches: dev_history
            .as_ref()
            .and_then(|d| d["pons_launches"].as_u64())
            .map(|n| n as usize),
        on_curve: pons
            .as_ref()
            .is_some_and(|p| p["curve"]["graduated"] == json!(false)),
    });
    Ok(json!({
        "token": token,
        "symbol": profile["symbol"],
        "name": profile["name"],
        "flags": flags,
        "contract": contract,
        "burned_pct": burned_pct,
        "profile": profile,
        "main_pool": main_pool,
        "recent_trading": activity,
        "pons": pons,
        "developer": dev,
        "developer_pons_launches": dev_history.as_ref().map(|d| json!({
            "count": d["pons_launches"],
            "latest": d["launches"].as_array().map(|l| l.iter().take(5).cloned().collect::<Vec<_>>()),
        })),
        "note": "Facts from the chain and GeckoTerminal, not advice. A clean report does not make a token safe.",
    }))
}

/// Run one research tool.
pub async fn run(sources: &Sources, tool: ResearchTool, input: Value) -> Result<Value, String> {
    let now = now_secs();
    match tool {
        ResearchTool::TokenSearch => {
            let q: SearchInput = parse(input)?;
            let query: String = q
                .query
                .trim()
                .chars()
                .filter(|c| c.is_alphanumeric() || " -_.$".contains(*c))
                .take(64)
                .collect();
            if query.is_empty() {
                return Err("give a name, symbol or address to search for".into());
            }
            let body = market_cached(
                sources,
                &format!(
                    "search/pools?query={}&network={MARKET_NETWORK}",
                    query.replace(' ', "%20")
                ),
            )
            .await?;
            Ok(json!({ "query": query, "pools": pools_list(&body, now) }))
        }
        ResearchTool::PoolsTrending => {
            let i: TrendingInput = parse(input)?;
            let window = match i.window.as_deref().unwrap_or("24h") {
                w @ ("5m" | "1h" | "6h" | "24h") => w,
                other => return Err(format!("window must be 5m, 1h, 6h or 24h, not {other}")),
            };
            let body = market_cached(
                sources,
                &market(&format!("trending_pools?duration={window}&page=1")),
            )
            .await?;
            Ok(json!({ "window": window, "pools": pools_list(&body, now) }))
        }
        ResearchTool::PoolsTop => {
            let i: TopInput = parse(input)?;
            let sort = match i.by.as_deref().unwrap_or("volume") {
                "volume" => "h24_volume_usd_desc",
                "transactions" => "h24_tx_count_desc",
                other => return Err(format!("by must be volume or transactions, not {other}")),
            };
            let path = match i.launchpad.as_deref() {
                Some(l) => market(&format!(
                    "dexes/{}/pools?sort={sort}&page=1",
                    parse_launchpad(l)?
                )),
                None => market(&format!("pools?sort={sort}&page=1")),
            };
            Ok(json!({ "pools": pools_list(&market_cached(sources, &path).await?, now) }))
        }
        ResearchTool::Launchpads => {
            // One page holds them all (52 at the time of writing); the endpoint takes no `page`.
            let body = market_cached(sources, &market("dexes")).await?;
            let all: Vec<Value> = body["data"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|d| json!({ "id": d["id"], "name": d["attributes"]["name"] }))
                .collect();
            Ok(json!({ "launchpads": all }))
        }
        ResearchTool::Launches => {
            let i: LaunchesInput = parse(input)?;
            let page = i.page.unwrap_or(1).clamp(1, 5);
            let path = match i.launchpad.as_deref() {
                Some(l) => market(&format!("dexes/{}/pools?page={page}", parse_launchpad(l)?)),
                None => market(&format!("new_pools?page={page}")),
            };
            let mut pools = pools_list(&market_cached(sources, &path).await?, now);
            pools.sort_by(|a, b| {
                num(&a["age_hours"])
                    .unwrap_or(f64::MAX)
                    .total_cmp(&num(&b["age_hours"]).unwrap_or(f64::MAX))
            });
            Ok(json!({ "launchpad": i.launchpad, "pools": pools }))
        }
        ResearchTool::PoolInfo => {
            let i: PoolInput = parse(input)?;
            let pool = parse_pool(&i.pool)?;
            Ok(pool_detail(
                &market_cached(sources, &market(&format!("pools/{pool}"))).await?,
                now,
            ))
        }
        ResearchTool::PoolTrades => {
            let i: TradesInput = parse(input)?;
            let pool = parse_pool(&i.pool)?;
            let wallet = i.wallet.as_deref().map(parse_address).transpose()?;
            let body = market_cached(sources, &market(&format!("pools/{pool}/trades"))).await?;
            let mut out = trades_summary(&body, wallet.as_deref(), i.min_usd);
            out["pool"] = json!(pool);
            Ok(out)
        }
        ResearchTool::PriceChart => {
            let i: ChartInput = parse(input)?;
            let pool = parse_pool(&i.pool)?;
            let timeframe = match i.timeframe.as_deref().unwrap_or("hour") {
                t @ ("minute" | "hour" | "day") => t,
                other => {
                    return Err(format!(
                        "timeframe must be minute, hour or day, not {other}"
                    ))
                }
            };
            let limit = i.limit.unwrap_or(48).clamp(1, 300);
            let body = market_cached(
                sources,
                &market(&format!("pools/{pool}/ohlcv/{timeframe}?limit={limit}")),
            )
            .await?;
            let mut out = chart_summary(&body);
            out["pool"] = json!(pool);
            out["timeframe"] = json!(timeframe);
            Ok(out)
        }
        ResearchTool::TokenProfile => {
            let i: TokenInput = parse(input)?;
            token_profile(sources, &i.token).await
        }
        ResearchTool::TokenReport => {
            let i: TokenInput = parse(input)?;
            token_report(sources, &i.token).await
        }
        ResearchTool::PonsLaunch => {
            let i: TokenInput = parse(input)?;
            pons_launch(sources, &parse_address(&i.token)?.to_lowercase()).await
        }
        ResearchTool::DevLaunches => {
            let i: DevInput = parse(input)?;
            dev_launches(sources, &i.wallet).await
        }
    }
}

/// The JSON schema of a research tool's input.
#[must_use]
pub fn input_schema(tool: ResearchTool) -> Value {
    fn s<T: JsonSchema>() -> Value {
        let mut v = serde_json::to_value(schemars::schema_for!(T)).unwrap_or_else(|_| json!({}));
        if let Some(o) = v.as_object_mut() {
            o.remove("$schema");
            o.remove("title");
        }
        v
    }
    match tool {
        ResearchTool::TokenSearch => s::<SearchInput>(),
        ResearchTool::PoolsTrending => s::<TrendingInput>(),
        ResearchTool::PoolsTop => s::<TopInput>(),
        ResearchTool::Launchpads => json!({ "type": "object", "properties": {} }),
        ResearchTool::Launches => s::<LaunchesInput>(),
        ResearchTool::PoolInfo => s::<PoolInput>(),
        ResearchTool::PoolTrades => s::<TradesInput>(),
        ResearchTool::PriceChart => s::<ChartInput>(),
        ResearchTool::TokenProfile | ResearchTool::TokenReport | ResearchTool::PonsLaunch => {
            s::<TokenInput>()
        }
        ResearchTool::DevLaunches => s::<DevInput>(),
    }
}
