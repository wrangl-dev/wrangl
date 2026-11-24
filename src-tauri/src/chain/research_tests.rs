use serde_json::{json, Value};

use super::research::*;

/// 2026-11-24T12:00:00Z
const NOW: i64 = 1_795_521_600;

fn pool_item() -> Value {
    json!({
        "attributes": {
            "address": "0xpool", "name": "CAT / WETH", "pool_created_at": "2026-11-24T06:00:00Z",
            "base_token_price_usd": "0.5", "fdv_usd": "1000000", "market_cap_usd": "900000",
            "reserve_in_usd": "5000.4", "locked_liquidity_percentage": null,
            "price_change_percentage": { "m5": "1.5", "h1": "-2", "h6": "10", "h24": "50" },
            "transactions": { "h24": { "buys": 30, "sells": 0, "buyers": 25, "sellers": 0 } },
            "volume_usd": { "h24": "12345.6" }
        },
        "relationships": {
            "dex": { "data": { "id": "pons-v2" } },
            "base_token": { "data": { "id": "robinhood_0xcat" } },
            "quote_token": { "data": { "id": "robinhood_0xweth" } }
        }
    })
}

#[test]
fn a_pool_is_trimmed_to_what_research_needs() {
    let p = pool_summary(&pool_item(), NOW);
    assert_eq!(p["dex"], "pons-v2");
    assert_eq!(p["base_token"], "0xcat");
    assert_eq!(p["age_hours"], 6.0);
    assert_eq!(p["liquidity_usd"], 5000.0);
    assert_eq!(p["h24"]["buys"], 30);
    assert_eq!(p["h24"]["change_pct"], 50.0);
    assert_eq!(p["h24"]["volume_usd"], 12346.0);
}

#[test]
fn trades_show_totals_whales_and_one_wallet() {
    let trade = |kind: &str, usd: &str, wallet: &str, t: &str| {
        json!({ "attributes": { "kind": kind, "volume_in_usd": usd, "tx_from_address": wallet,
                                "block_timestamp": t, "tx_hash": "0x1", "is_anomalous": false } })
    };
    let body = json!({ "data": [
        trade("sell", "900", "0xDEV", "2026-11-24T11:00:00Z"),
        trade("buy", "100", "0xa", "2026-11-24T10:00:00Z"),
        trade("buy", "50", "0xa", "2026-11-24T09:00:00Z"),
        trade("buy", "5", "0xb", "2026-11-24T08:00:00Z"),
        { "attributes": { "kind": "buy", "volume_in_usd": "99999", "tx_from_address": "0xbot", "is_anomalous": true } },
    ] });
    let s = trades_summary(&body, None, None);
    assert_eq!(s["trades"], 4);
    assert_eq!(
        (s["buys"].clone(), s["buy_usd"].clone()),
        (json!(3), json!(155.0))
    );
    assert_eq!(s["sell_usd"], 900.0);
    assert_eq!(s["unique_wallets"], 3);
    assert_eq!(s["top_buyers"][0]["wallet"], "0xa");
    assert_eq!(s["top_buyers"][0]["bought_usd"], 150.0);
    assert_eq!(s["top_sellers"][0]["wallet"], "0xdev");
    assert_eq!(s["largest"][0]["usd"], 900.0);
    assert_eq!(
        (s["from"].clone(), s["to"].clone()),
        (json!("2026-11-24T08:00:00Z"), json!("2026-11-24T11:00:00Z"))
    );

    let one = trades_summary(&body, Some("0xdev"), None);
    assert_eq!(one["trades"], 1);
    assert_eq!(trades_summary(&body, None, Some(60.0))["trades"], 2);
}

#[test]
fn candles_are_summarised_oldest_first() {
    let body = json!({ "data": { "attributes": { "ohlcv_list": [
        [3, 2.0, 2.0, 1.0, 1.0, 10],
        [2, 1.0, 4.0, 1.0, 2.0, 20],
        [1, 1.0, 1.0, 1.0, 1.0, 30],
    ] } } });
    let c = chart_summary(&body);
    assert_eq!(c["count"], 3);
    assert_eq!((c["from"].clone(), c["to"].clone()), (json!(1), json!(3)));
    assert_eq!(c["change_pct"], 0.0);
    assert_eq!(c["high"], 4.0);
    assert_eq!(c["drop_from_high_pct"], 75.0);
    assert_eq!(c["volume_usd"], 60.0);
    assert_eq!(c["candles"][0]["t"], 1);
    assert!(c["volatility_pct_per_candle"].as_f64().unwrap() > 0.0);
    assert_eq!(chart_summary(&json!({}))["candles"], json!([]));
}

#[test]
fn a_profile_reads_holders_developer_and_launchpad() {
    let info = json!({ "data": { "attributes": {
        "address": "0xcat", "symbol": "CAT", "name": "Cat",
        "holders": { "count": 120, "distribution_percentage": { "top_10": "72.5", "11_30": "10", "31_50": "5", "rest": "12.5" } },
        "developer_address": "0xdev", "developer_holding_percentage": "8.2",
        "gt_score": 41.234, "is_honeypot": "unknown", "websites": [], "twitter_handle": null, "telegram_handle": null
    } } });
    let multi = json!({ "data": [ { "attributes": { "launchpad_details": { "graduation_percentage": 40.0, "completed": false }, "market_cap_usd": "12000.4" } } ] });
    let p = profile(&info, Some(&multi));
    assert_eq!(p["holders"], 120);
    assert_eq!(p["top10_pct"], 72.5);
    assert_eq!(p["developer"], "0xdev");
    assert_eq!(p["gt_score"], 41.2);
    assert_eq!(p["launchpad"]["graduation_percentage"], 40.0);
    assert_eq!(p["market_cap_usd"], 12000.0);
}

#[test]
fn risk_flags_name_what_is_wrong_and_why() {
    let contract = json!({
        "ownership_renounced": false,
        "code": { "privileged_functions": ["mint(address,uint256)", "pause()"] },
        "eip1967_implementation": null
    });
    let profile = json!({ "top10_pct": 72.5, "developer_holding_pct": 8.2, "honeypot": "unknown",
                          "websites": [], "twitter": null, "telegram": null });
    let pool = pool_summary(&pool_item(), NOW);
    let flags = risk_flags(&RiskInputs {
        contract,
        profile,
        main_pool: Some(pool),
        burned_pct: Some(60.0),
        dev_launches: Some(7),
        on_curve: false,
    });
    let names: Vec<&str> = flags.iter().map(|f| f["flag"].as_str().unwrap()).collect();
    for want in [
        "can mint",
        "can pause",
        "concentrated",
        "developer holds a lot",
        "serial launcher",
        "thin liquidity",
        "new",
        "no sells",
        "burned",
        "no socials",
    ] {
        assert!(names.contains(&want), "missing {want} in {names:?}");
    }
    let mint = flags.iter().find(|f| f["flag"] == "can mint").unwrap();
    assert_eq!(mint["level"], "warn");

    // Renounced: the same powers are only information.
    let calm = risk_flags(&RiskInputs {
        contract: json!({ "ownership_renounced": true, "code": { "privileged_functions": ["mint(address,uint256)"] } }),
        profile: json!({ "top10_pct": 20.0, "twitter": "cat" }),
        main_pool: None,
        burned_pct: None,
        dev_launches: Some(1),
        on_curve: false,
    });
    assert_eq!(
        calm.iter().find(|f| f["flag"] == "can mint").unwrap()["level"],
        "info"
    );
    assert!(calm.iter().any(|f| f["flag"] == "no pool"));
    assert!(!calm
        .iter()
        .any(|f| f["flag"] == "serial launcher" || f["flag"] == "concentrated"));
}

#[test]
fn on_a_pons_curve_concentration_is_only_information() {
    let flags = risk_flags(&RiskInputs {
        contract: json!({}),
        profile: json!({ "top10_pct": 100.0, "twitter": "x" }),
        main_pool: None,
        burned_pct: None,
        dev_launches: None,
        on_curve: true,
    });
    let c = flags.iter().find(|f| f["flag"] == "concentrated").unwrap();
    assert_eq!(c["level"], "info");
    assert!(c["why"].as_str().unwrap().contains("bonding curve"));
}

#[test]
fn a_pons_curve_fills_as_supply_leaves_the_pool() {
    assert_eq!(curve_progress(1000.0, 1000.0)["filled_pct"], 0.0);
    // Half the supply left in the curve: (1/0.5 - 1) / 2.5 = 40%.
    assert_eq!(curve_progress(500.0, 1000.0)["filled_pct"], 40.0);
    assert_eq!(curve_progress(0.0, 1000.0)["graduated"], true);
    assert_eq!(curve_progress(10.0, 0.0)["known"], false);
}

#[test]
fn pool_ids_and_launchpads_are_checked() {
    assert!(parse_pool("0xD42A491087A15E5AFD51FEB3606066CC152D2B09").is_ok());
    assert!(parse_pool(&format!("0x{}", "a".repeat(64))).is_ok());
    assert!(parse_pool("0x123").is_err());
    assert!(parse_pool("pons-v2").is_err());
}

/// Every tool against GeckoTerminal and the chain: `cargo test -- --ignored live_research`.
#[tokio::test]
#[ignore = "network"]
async fn live_research_tools() {
    use super::client::Sources;
    let sources = Sources::public();
    let mut pool = String::new();
    let mut token = String::new();
    for (tool, input) in [
        (ResearchTool::TokenSearch, json!({ "query": "nvidia" })),
        (ResearchTool::PoolsTrending, json!({ "window": "1h" })),
        (ResearchTool::PoolsTop, json!({ "by": "volume" })),
        (ResearchTool::Launchpads, json!({})),
        (ResearchTool::Launches, json!({ "launchpad": "pons-v2" })),
    ] {
        let out = run(&sources, tool, input)
            .await
            .unwrap_or_else(|e| panic!("{}: {e}", tool.name()));
        let pools = out["pools"]
            .as_array()
            .or(out["launchpads"].as_array())
            .map_or(0, Vec::len);
        eprintln!("{}: {pools} rows", tool.name());
        assert!(pools > 0, "{}: {out}", tool.name());
        if tool == ResearchTool::PoolsTrending {
            pool = out["pools"][0]["pool"].as_str().unwrap().to_string();
            token = out["pools"][0]["base_token"].as_str().unwrap().to_string();
        }
        tokio::time::sleep(std::time::Duration::from_secs(8)).await;
    }
    for (tool, input) in [
        (ResearchTool::PoolInfo, json!({ "pool": pool })),
        (ResearchTool::PoolTrades, json!({ "pool": pool })),
        (
            ResearchTool::PriceChart,
            json!({ "pool": pool, "timeframe": "hour", "limit": 24 }),
        ),
        (ResearchTool::TokenReport, json!({ "token": token })),
    ] {
        let out = run(&sources, tool, input)
            .await
            .unwrap_or_else(|e| panic!("{}: {e}", tool.name()));
        let text = out.to_string();
        eprintln!(
            "{}: {} bytes; {}",
            tool.name(),
            text.len(),
            &text[..text.len().min(300)]
        );
        tokio::time::sleep(std::time::Duration::from_secs(8)).await;
    }
}

/// Pons tools need the official RPC: `cargo test -- --ignored live_pons`.
#[tokio::test]
#[ignore = "network"]
async fn live_pons_tools() {
    use super::client::Sources;
    let sources = Sources::public();
    // OffRouter, a Pons coin that graduated, and its creator (from Legitscan's tests).
    let token = "0x47b537f7c2c2183967fe5ba883291b8ada490db6";
    let launch = run(
        &sources,
        ResearchTool::PonsLaunch,
        json!({ "token": token }),
    )
    .await
    .unwrap();
    eprintln!("pons_launch: {launch}");
    assert_eq!(launch["pons"], true);
    assert_eq!(
        launch["creator"],
        "0x047e8c634557fc35c9ee8889d117f2134104d612"
    );
    let dev = run(
        &sources,
        ResearchTool::DevLaunches,
        json!({ "wallet": launch["creator"] }),
    )
    .await
    .unwrap();
    let text = dev.to_string();
    eprintln!("dev_launches: {}", &text[..text.len().min(800)]);
    assert!(dev["pons_launches"].as_u64().unwrap() >= 1);
}

/// A fresh Pons V2 coin end to end: `cargo test -- --ignored live_fresh_pons`.
#[tokio::test]
#[ignore = "network"]
async fn live_fresh_pons_report() {
    let sources = super::client::Sources::public();
    let token = std::env::var("PONS_TOKEN")
        .unwrap_or_else(|_| "0x3fac1e319e0e46344aa80b1a1277157578c71169".to_string());
    let r = run(
        &sources,
        ResearchTool::TokenReport,
        json!({ "token": token }),
    )
    .await
    .unwrap();
    eprintln!("flags: {}", r["flags"]);
    eprintln!("pons: {}", r["pons"]);
    eprintln!(
        "developer: {} launches: {}",
        r["developer"], r["developer_pons_launches"]["count"]
    );
    eprintln!(
        "holders: {} top10: {} pool liq: {}",
        r["profile"]["holders"], r["profile"]["top10_pct"], r["main_pool"]["liquidity_usd"]
    );
}
