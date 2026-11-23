use super::settings::{validate_rpc_url, Settings, SettingsPatch, SettingsStore};

#[test]
fn rpc_urls_must_be_https_except_on_this_machine() {
    assert!(validate_rpc_url("https://robinhood-mainnet.g.alchemy.com/v2/KEY").is_ok());
    assert!(validate_rpc_url("http://localhost:8545").is_ok());
    assert!(validate_rpc_url("http://rpc.example.com").is_err());
    assert!(validate_rpc_url("wss://rpc.example.com").is_err());
    assert!(validate_rpc_url("not a url").is_err());
}

#[test]
fn the_view_shows_only_whether_values_are_set_and_the_host() {
    let s = Settings {
        robinhood_rpc_url: Some("https://robinhood-mainnet.g.alchemy.com/v2/SECRET".into()),
        coingecko_api_key: Some("cg-SECRET".into()),
    };
    let view = serde_json::to_string(&s.view()).unwrap();
    assert!(!view.contains("SECRET"), "{view}");
    assert!(view.contains("robinhood-mainnet.g.alchemy.com"));
    assert!(s.view().coingecko_key_set);
}

#[test]
fn a_patch_keeps_untouched_values_clears_empty_ones_and_rejects_bad_urls() {
    let mut s = Settings::default();
    s.apply(SettingsPatch {
        robinhood_rpc_url: Some("  https://rpc.example/key  ".into()),
        coingecko_api_key: Some("cg".into()),
    })
    .unwrap();
    assert_eq!(
        s.robinhood_rpc_url.as_deref(),
        Some("https://rpc.example/key")
    );

    s.apply(SettingsPatch {
        robinhood_rpc_url: None,
        coingecko_api_key: Some(String::new()),
    })
    .unwrap();
    assert_eq!(
        s.robinhood_rpc_url.as_deref(),
        Some("https://rpc.example/key")
    );
    assert_eq!(s.coingecko_api_key, None);

    let before = s.clone();
    assert!(s
        .apply(SettingsPatch {
            robinhood_rpc_url: Some("http://evil.example".into()),
            coingecko_api_key: None,
        })
        .is_err());
    assert_eq!(s, before, "a rejected patch changes nothing");
}

#[test]
fn settings_round_trip_through_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let store = SettingsStore::new(Some(dir.path().join("sub/settings.json")));
    assert_eq!(store.load(), Settings::default());
    let s = Settings {
        robinhood_rpc_url: Some("https://rpc.example/key".into()),
        coingecko_api_key: None,
    };
    store.save(&s).unwrap();
    assert_eq!(store.load(), s);
    std::fs::write(dir.path().join("sub/settings.json"), "{broken").unwrap();
    assert_eq!(store.load(), Settings::default());
}

#[test]
fn saved_values_go_to_the_tool_server() {
    let s = Settings {
        robinhood_rpc_url: Some("https://rpc.example/key".into()),
        coingecko_api_key: Some("cg".into()),
    };
    let env = s.tool_env();
    assert!(env.contains(&("ROBINHOOD_RPC_URL", "https://rpc.example/key".into())));
    assert!(env.contains(&("COINGECKO_API_KEY", "cg".into())));
}
