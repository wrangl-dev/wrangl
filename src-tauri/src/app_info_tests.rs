use super::app_info::{current, CHAIN_ID};

#[test]
fn reports_crate_version_and_mainnet_chain() {
    let info = current();
    assert_eq!(info.name, "Wrangl");
    assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(info.chain_id, CHAIN_ID);
}

#[test]
fn serializes_in_camel_case_for_the_ui() {
    let json = serde_json::to_value(current()).unwrap();
    assert_eq!(json["chainId"], 4663);
    assert!(json.get("chain_id").is_none());
}
