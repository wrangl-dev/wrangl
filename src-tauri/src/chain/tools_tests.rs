use sha3::{Digest, Keccak256};

use super::tools::*;

fn selector(signature: &str) -> String {
    let hash = Keccak256::digest(signature.as_bytes());
    hash[..4].iter().map(|b| format!("{b:02x}")).collect()
}

#[test]
fn hard_coded_selectors_match_their_signatures() {
    for (sel, signature) in [
        (SEL_NAME, "name()"),
        (SEL_SYMBOL, "symbol()"),
        (SEL_DECIMALS, "decimals()"),
        (SEL_TOTAL_SUPPLY, "totalSupply()"),
        (SEL_OWNER, "owner()"),
        (SEL_BALANCE_OF, "balanceOf(address)"),
    ] {
        assert_eq!(sel, selector(signature), "{signature}");
    }
    for (sel, signature) in PRIVILEGED {
        assert_eq!(*sel, selector(signature), "{signature}");
    }
}

#[test]
fn eip1967_slot_is_the_spec_value() {
    let hash = Keccak256::digest(b"eip1967.proxy.implementation");
    let mut bytes: [u8; 32] = hash.into();
    // minus one, big-endian
    for byte in bytes.iter_mut().rev() {
        let (value, borrow) = byte.overflowing_sub(1);
        *byte = value;
        if !borrow {
            break;
        }
    }
    let expected: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(EIP1967_IMPLEMENTATION_SLOT, format!("0x{expected}"));
}

#[test]
fn addresses_hashes_and_calldata_are_validated() {
    assert_eq!(
        parse_address(" 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 ").unwrap(),
        "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
    );
    assert!(parse_address("0x123").is_err());
    assert!(parse_address("5fc5360d0400a0fd4f2af552add042d716f1d168").is_err());
    assert!(parse_address("0xzzc5360d0400a0fd4f2af552add042d716f1d168").is_err());
    assert!(parse_tx_hash(&format!("0x{}", "ab".repeat(32))).is_ok());
    assert!(parse_tx_hash(&format!("0x{}", "ab".repeat(31))).is_err());
    assert!(parse_calldata("0x18160ddd").is_ok());
    assert!(parse_calldata("0x18160dd").is_err());
    assert!(parse_calldata("0x1816").is_err());
}

#[test]
fn balance_of_calldata_pads_the_address() {
    assert_eq!(
        call_with_address(SEL_BALANCE_OF, "0x5fc5360d0400a0fd4f2af552add042d716f1d168"),
        "0x70a082310000000000000000000000005fc5360d0400a0fd4f2af552add042d716f1d168"
    );
}

#[test]
fn big_hex_numbers_become_decimal() {
    assert_eq!(hex_to_decimal("0x0").as_deref(), Some("0"));
    assert_eq!(hex_to_decimal("0x").as_deref(), Some("0"));
    assert_eq!(hex_to_decimal("0xff").as_deref(), Some("255"));
    // 2^256 - 1
    assert_eq!(
        hex_to_decimal(&format!("0x{}", "f".repeat(64))).as_deref(),
        Some("115792089237316195423570985008687907853269984665640564039457584007913129639935")
    );
    // 1e27 (a 1B supply with 18 decimals)
    assert_eq!(
        hex_to_decimal("0x033b2e3c9fd0803ce8000000").as_deref(),
        Some("1000000000000000000000000000")
    );
    assert_eq!(hex_to_decimal("0xnothex"), None);
}

#[test]
fn units_are_formatted_without_trailing_zeros() {
    assert_eq!(format_units("1500000", 6), "1.5");
    assert_eq!(format_units("1000000", 6), "1");
    assert_eq!(format_units("5", 6), "0.000005");
    assert_eq!(format_units("0", 18), "0");
    assert_eq!(format_units("42", 0), "42");
}

#[test]
fn abi_words_decode() {
    let word = |hex: &str| format!("0x{hex:0>64}");
    assert_eq!(decode_u64(&word("12")), Some(18));
    assert_eq!(decode_u64("0x"), None);
    assert_eq!(decode_u64(&format!("0x{}", "f".repeat(64))), None);
    assert_eq!(
        decode_address(&word("5fc5360d0400a0fd4f2af552add042d716f1d168")).as_deref(),
        Some("0x5fc5360d0400a0fd4f2af552add042d716f1d168")
    );
}

#[test]
fn strings_decode_from_dynamic_abi_and_bytes32() {
    // abi.encode("USDG"): offset 0x20, length 4, data right-padded.
    let dynamic = format!("0x{:0>64}{:0>64}{:0<64}", "20", "4", "55534447");
    assert_eq!(decode_string(&dynamic).as_deref(), Some("USDG"));
    // bytes32 "MKR" (old-style tokens).
    let fixed = format!("0x{:0<64}", "4d4b52");
    assert_eq!(decode_string(&fixed).as_deref(), Some("MKR"));
    // A revert-less empty return is not a string.
    assert_eq!(decode_string("0x"), None);
    // A length past the data is refused, not read out of bounds.
    let broken = format!("0x{:0>64}{:0>64}", "20", "ff");
    assert_eq!(decode_string(&broken), None);
}

#[test]
fn push_data_is_not_read_as_opcodes() {
    // PUSH4 40c10f19 (mint), then PUSH32 whose data contains 0x63 + the
    // pause selector: only the real PUSH4 counts.
    let code = format!("0x6340c10f19{}{}{}", "7f", "638456cb59", "00".repeat(27));
    let bytes = decode_hex_bytes(code.trim_start_matches("0x")).unwrap();
    assert_eq!(push4_selectors(&bytes), vec!["40c10f19".to_string()]);
    let facts = code_facts(&code);
    assert_eq!(facts.privileged_functions, vec!["mint(address,uint256)"]);
    assert_eq!(facts.clone_of, None);
}

#[test]
fn minimal_proxies_name_their_implementation() {
    let implementation = "bebebebebebebebebebebebebebebebebebebebe";
    let eip1167 = format!("0x363d3d373d3d3d363d73{implementation}5af43d82803e903d91602b57fd5bf3");
    assert_eq!(
        code_facts(&eip1167).clone_of,
        Some(format!("0x{implementation}"))
    );
    let live_layout = format!("0x3d3d3d3d363d3d37363d73{implementation}5af43d3d93803e602a57fd5bf3");
    let facts = code_facts(&live_layout);
    assert_eq!(facts.clone_of, Some(format!("0x{implementation}")));
    assert_eq!(facts.size_bytes, 44);
}

#[test]
fn burn_owners_are_recognised() {
    assert!(is_burn_owner("0x0000000000000000000000000000000000000000"));
    assert!(is_burn_owner("0x000000000000000000000000000000000000dEaD"));
    assert!(!is_burn_owner("0x5fc5360d0400a0fd4f2af552add042d716f1d168"));
}

#[test]
fn tool_names_are_the_advertised_ones() {
    assert_eq!(ChainTool::Status.name(), "chain_status");
    assert_eq!(ChainTool::NewPools.name(), "chain_new_pools");
    let tool: ChainTool = serde_json::from_str("\"new_pools\"").unwrap();
    assert_eq!(tool, ChainTool::NewPools);
}
