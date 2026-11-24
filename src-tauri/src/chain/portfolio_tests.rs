use std::collections::HashMap;

use serde_json::json;

use super::portfolio::*;

fn token(address: &str, symbol: &str, decimals: u32) -> TokenInfo {
    TokenInfo {
        address: address.into(),
        symbol: symbol.into(),
        name: format!("{symbol} token"),
        decimals: Some(decimals),
    }
}

#[test]
fn reads_tokens_from_a_pools_page_without_native_eth() {
    let body = json!({
        "data": [],
        "included": [
            { "id": "robinhood_0xAbC", "type": "token",
              "attributes": { "address": "0xAbC", "symbol": "NVDA", "name": "Nvidia", "decimals": 18 } },
            { "id": "robinhood_0x0000000000000000000000000000000000000000", "type": "token",
              "attributes": { "symbol": "WETH", "decimals": 18 } },
            { "id": "robinhood_0xdef", "type": "token", "attributes": { "symbol": "USDG", "decimals": 6 } },
            { "id": "x", "type": "dex", "attributes": {} }
        ]
    });
    let tokens = tokens_in_pools(&body);
    assert_eq!(tokens.len(), 2);
    assert_eq!(
        tokens[0],
        TokenInfo {
            address: "0xabc".into(),
            symbol: "NVDA".into(),
            name: "Nvidia".into(),
            decimals: Some(18)
        }
    );
    assert_eq!(tokens[1].address, "0xdef");
}

#[test]
fn reads_prices_and_24h_changes() {
    let body = json!({ "data": { "attributes": {
        "token_prices": { "0xabc": "2.5", "0xdef": null },
        "h24_price_change_percentage": { "0xabc": "-10" }
    } } });
    let prices = simple_prices(&body);
    assert_eq!(
        prices["0xabc"],
        Price {
            usd: Some(2.5),
            change24h: Some(-10.0)
        }
    );
    assert_eq!(
        prices["0xdef"],
        Price {
            usd: None,
            change24h: None
        }
    );
}

#[test]
fn reads_market_facts() {
    let body = json!({ "data": [ { "attributes": {
        "address": "0xABC", "symbol": "NVDA", "name": "Nvidia", "price_usd": "180.5",
        "fdv_usd": "1000000", "total_reserve_in_usd": "52000.1", "volume_usd": { "h24": "900" }
    } } ] });
    let m = &tokens_multi(&body)[0];
    assert_eq!(m.address, "0xabc");
    assert_eq!(m.price_usd, Some(180.5));
    assert_eq!(m.liquidity_usd, Some(52000.1));
    assert_eq!(m.volume24h_usd, Some(900.0));
}

#[test]
fn a_portfolio_skips_empty_balances_sorts_by_value_and_sums_the_day() {
    let balances = vec![
        (token("0xaaa", "USDG", 6), "25000000".to_string()), // 25 USDG
        (token("0xbbb", "NVDA", 18), "0".to_string()),
        (token("0xccc", "SPY", 18), "2000000000000000000".to_string()), // 2 SPY
        (
            token("0xddd", "NOPRICE", 18),
            "1000000000000000000".to_string(),
        ),
    ];
    let prices = HashMap::from([
        (
            "0xaaa".to_string(),
            Price {
                usd: Some(1.0),
                change24h: Some(0.0),
            },
        ),
        (
            "0xccc".to_string(),
            Price {
                usd: Some(100.0),
                change24h: Some(25.0),
            },
        ),
        (
            WETH.to_string(),
            Price {
                usd: Some(2000.0),
                change24h: None,
            },
        ),
    ]);
    // 0.01 ETH
    let p = assemble(
        "0xme".into(),
        Some("10000000000000000"),
        &balances,
        &prices,
        4,
        "public RPC",
    );
    let symbols: Vec<&str> = p.holdings.iter().map(|h| h.symbol.as_str()).collect();
    assert_eq!(symbols, ["SPY", "USDG", "ETH", "NOPRICE"]);
    assert_eq!(p.holdings[0].amount, "2");
    assert_eq!(p.holdings[2].value_usd, Some(20.0));
    assert_eq!(p.holdings[3].value_usd, None);
    assert!((p.total_usd - 245.0).abs() < 1e-9);
    // SPY is worth 200 after +25%: it was 160, so the day made 40.
    assert!((p.change24h_usd - 40.0).abs() < 1e-9);
    assert_eq!(p.tokens_checked, 4);
}

#[test]
fn an_empty_wallet_is_an_empty_portfolio() {
    let p = assemble(
        "0xme".into(),
        Some("0"),
        &[],
        &HashMap::new(),
        0,
        "public RPC",
    );
    assert!(p.holdings.is_empty());
    assert_eq!(p.total_usd, 0.0);
}

/// Reaches GeckoTerminal and the public RPCs: `cargo test -- --ignored live_portfolio`.
#[tokio::test]
#[ignore = "network"]
async fn live_portfolio_of_a_busy_address() {
    let sources = super::client::Sources::public();
    let tokens = top_tokens(&sources).await.unwrap();
    assert!(tokens.len() > 5, "{tokens:?}");
    let p = portfolio(
        &sources,
        "0x6131b5fae19ea4f9d964eac0408e4408b66337b5",
        tokens,
    )
    .await
    .unwrap();
    eprintln!(
        "checked {} tokens; {} held; total ${:.2}; day {:+.2}",
        p.tokens_checked,
        p.holdings.len(),
        p.total_usd,
        p.change24h_usd
    );
    for h in p.holdings.iter().take(5) {
        eprintln!("  {} {} = {:?}", h.amount, h.symbol, h.value_usd);
    }
    let usdg = "0x5fc5360d0400a0fd4f2af552add042d716f1d168".to_string();
    let m = markets(&sources, &[usdg]).await.unwrap();
    eprintln!("USDG market: {m:?}");
    assert_eq!(m[0].symbol.as_deref(), Some("USDG"));
}
