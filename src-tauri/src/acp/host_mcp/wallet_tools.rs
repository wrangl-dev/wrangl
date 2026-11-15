//! The wallet tools of the host `wrangl` MCP server: what the child
//! advertises and the pure checks the parent runs on a proposed transaction.
//!
//! No tool signs anything. `wallet_send_transaction` only proposes: the user
//! reviews it on the local signer page and signs it in their own wallet
//! (MetaMask, Rabby, ...). Wrangl never sees a private key or seed phrase.

use rmcp::schemars;
use serde::{Deserialize, Serialize};

use super::chain_tools::{hex_to_decimal, parse_address, parse_calldata};

/// The tool a `Wallet` frame serves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WalletTool {
    Address,
    SendTransaction,
}

impl WalletTool {
    /// The MCP tool name, for logs.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Address => "wallet_address",
            Self::SendTransaction => "wallet_send_transaction",
        }
    }
}

/// Input of `wallet_send_transaction`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct WalletSendTransactionInput {
    /// The recipient or contract address (0x followed by 40 hex characters).
    pub to: String,
    /// Native ETH to send, in ETH as a decimal string (for example "0.01").
    /// Omit or "0" for a plain contract call.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_eth: Option<String>,
    /// ABI-encoded calldata, 0x-prefixed hex. Omit for a plain ETH transfer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    /// One plain sentence telling the user what this transaction does, for
    /// example "Swap 0.01 ETH for TOKEN on the Uniswap v2 router". Shown on the
    /// signing page next to the raw fields.
    pub description: String,
}

pub const ADDRESS_DESCRIPTION: &str = "The wallet address the user connected to Wrangl, or \
connected=false when none is. Use it as the sender for chain_call simulations and as the owner \
for chain_balance. Watch-only: Wrangl holds no key. When no wallet is connected, ask the user to \
open Wallet in Wrangl's rail and connect it; never ask for a private key or seed phrase.";

pub const SEND_TRANSACTION_DESCRIPTION: &str = "Propose a transaction on Robinhood Chain \
(chain id 4663) from the user's connected wallet. Wrangl simulates it first and refuses one that \
would revert, flags unlimited token approvals, then shows it to the user on a local signing page. \
The user signs it in their own wallet or rejects it; this call waits for that and returns \
{status: \"sent\", hash} or {status: \"rejected\"}. Nothing is sent without the user's click in \
their wallet. Give a one-sentence description of what the transaction does. Never ask the user \
for a private key or seed phrase.";

/// A proposed transaction after validation: lowercased addresses, value in
/// wei as 0x-hex, calldata as 0x-hex ("0x" when empty).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidTransaction {
    pub to: String,
    pub value_wei_hex: String,
    pub value_eth: String,
    pub data: String,
    pub description: String,
}

/// Longest description shown on the signing page.
const MAX_DESCRIPTION: usize = 280;

/// Check and normalise a proposed transaction.
pub fn validate_transaction(input: WalletSendTransactionInput) -> Result<ValidTransaction, String> {
    let to = parse_address(&input.to)?;
    let value_wei = match input.value_eth.as_deref().map(str::trim) {
        None | Some("") => 0,
        Some(eth) => parse_eth(eth)?,
    };
    let data = match input.data.as_deref().map(str::trim) {
        None | Some("") | Some("0x") => "0x".to_string(),
        Some(data) => parse_calldata(data)?,
    };
    if value_wei == 0 && data == "0x" {
        return Err("the transaction sends nothing: give value_eth, data or both".to_string());
    }
    let description = input.description.trim();
    if description.is_empty() {
        return Err("description must say what the transaction does".to_string());
    }
    let description: String = description.chars().take(MAX_DESCRIPTION).collect();
    Ok(ValidTransaction {
        to,
        value_wei_hex: format!("0x{value_wei:x}"),
        value_eth: format_eth(value_wei),
        data,
        description,
    })
}

/// A decimal ETH amount ("0.01", "1", "2.5") as wei. At most 18 decimals.
pub fn parse_eth(input: &str) -> Result<u128, String> {
    let err = || format!("`{input}` is not an ETH amount like 0.01");
    let (whole, fraction) = input.split_once('.').unwrap_or((input, ""));
    if whole.is_empty() && fraction.is_empty() {
        return Err(err());
    }
    if !whole.bytes().all(|b| b.is_ascii_digit()) || !fraction.bytes().all(|b| b.is_ascii_digit()) {
        return Err(err());
    }
    if fraction.len() > 18 {
        return Err(format!("`{input}` has more than 18 decimals"));
    }
    let whole: u128 = if whole.is_empty() {
        0
    } else {
        whole.parse().map_err(|_| err())?
    };
    let fraction: u128 = format!("{fraction:0<18}").parse().map_err(|_| err())?;
    whole
        .checked_mul(1_000_000_000_000_000_000)
        .and_then(|w| w.checked_add(fraction))
        .ok_or_else(|| format!("`{input}` is too large"))
}

/// Wei as a decimal ETH string with trailing zeros trimmed.
#[must_use]
pub fn format_eth(wei: u128) -> String {
    let unit = 1_000_000_000_000_000_000u128;
    let whole = wei / unit;
    let fraction = wei % unit;
    if fraction == 0 {
        return whole.to_string();
    }
    let fraction = format!("{fraction:018}");
    format!("{whole}.{}", fraction.trim_end_matches('0'))
}

/// `approve(address,uint256)`.
const APPROVE: &str = "095ea7b3";
/// `setApprovalForAll(address,bool)`.
const SET_APPROVAL_FOR_ALL: &str = "a22cb465";
/// `increaseAllowance(address,uint256)`.
const INCREASE_ALLOWANCE: &str = "39509351";
/// `transfer(address,uint256)`.
const TRANSFER: &str = "a9059cbb";

/// Plain-language warnings about calldata the user should read before
/// signing. Empty when nothing stands out.
#[must_use]
pub fn calldata_warnings(data: &str) -> Vec<String> {
    let body = data.trim_start_matches("0x");
    if body.len() < 8 {
        return Vec::new();
    }
    let (selector, args) = body.split_at(8);
    let word = |i: usize| args.get(i * 64..(i + 1) * 64);
    let address_arg = || word(0).map(|w| format!("0x{}", &w[24..]));
    let mut warnings = Vec::new();
    match selector {
        APPROVE | INCREASE_ALLOWANCE => {
            if let Some(amount) = word(1) {
                if amount.starts_with('f') || amount.starts_with("7f") {
                    warnings.push(format!(
                        "Unlimited token approval: {} could move ALL of this token from your \
                         wallet, now and later. Approve only the amount this trade needs.",
                        address_arg().unwrap_or_default()
                    ));
                } else if let Some(amount) = hex_to_decimal(&format!("0x{amount}")) {
                    warnings.push(format!(
                        "Token approval: lets {} spend up to {amount} base units of this token.",
                        address_arg().unwrap_or_default()
                    ));
                }
            }
        }
        SET_APPROVAL_FOR_ALL => {
            if word(1).is_some_and(|w| w.ends_with('1')) {
                warnings.push(format!(
                    "Approval for ALL your NFTs in this collection to {}. Scams use this to \
                     empty wallets.",
                    address_arg().unwrap_or_default()
                ));
            }
        }
        TRANSFER => {
            if let (Some(to), Some(amount)) = (address_arg(), word(1)) {
                if let Some(amount) = hex_to_decimal(&format!("0x{amount}")) {
                    warnings.push(format!(
                        "Token transfer of {amount} base units to {to}. Check the address."
                    ));
                }
            }
        }
        _ => {}
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(to: &str, value: Option<&str>, data: Option<&str>) -> WalletSendTransactionInput {
        WalletSendTransactionInput {
            to: to.to_string(),
            value_eth: value.map(str::to_string),
            data: data.map(str::to_string),
            description: "test".to_string(),
        }
    }

    const ADDR: &str = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

    #[test]
    fn parse_eth_handles_whole_fraction_and_bounds() {
        assert_eq!(parse_eth("1").unwrap(), 1_000_000_000_000_000_000);
        assert_eq!(parse_eth("0.01").unwrap(), 10_000_000_000_000_000);
        assert_eq!(parse_eth(".5").unwrap(), 500_000_000_000_000_000);
        assert_eq!(parse_eth("0.000000000000000001").unwrap(), 1);
        assert!(parse_eth("0.0000000000000000001").is_err());
        assert!(parse_eth("-1").is_err());
        assert!(parse_eth("1e18").is_err());
        assert!(parse_eth(".").is_err());
        assert!(parse_eth("").is_err());
    }

    #[test]
    fn format_eth_round_trips() {
        for eth in ["0", "1", "0.01", "2.5", "0.000000000000000001"] {
            assert_eq!(format_eth(parse_eth(eth).unwrap()), eth);
        }
    }

    #[test]
    fn validate_normalises_and_rejects_empty_transactions() {
        let tx = validate_transaction(input(ADDR, Some("0.01"), None)).unwrap();
        assert_eq!(tx.to, ADDR.to_lowercase());
        assert_eq!(tx.value_wei_hex, "0x2386f26fc10000");
        assert_eq!(tx.value_eth, "0.01");
        assert_eq!(tx.data, "0x");

        assert!(validate_transaction(input(ADDR, None, None)).is_err());
        assert!(validate_transaction(input(ADDR, Some("0"), Some("0x"))).is_err());
        assert!(validate_transaction(input("0x1234", Some("1"), None)).is_err());
        assert!(validate_transaction(input(ADDR, None, Some("0x12"))).is_err());

        let mut blank = input(ADDR, Some("1"), None);
        blank.description = "  ".to_string();
        assert!(validate_transaction(blank).is_err());
    }

    fn approve(amount: &str) -> String {
        format!(
            "0x{APPROVE}{:0>64}{amount:0>64}",
            "1111111111111111111111111111111111111111"
        )
    }

    #[test]
    fn flags_unlimited_and_limited_approvals() {
        let unlimited = calldata_warnings(&approve(&"f".repeat(64)));
        assert_eq!(unlimited.len(), 1);
        assert!(unlimited[0].starts_with("Unlimited token approval"));
        assert!(unlimited[0].contains("0x1111111111111111111111111111111111111111"));

        let limited = calldata_warnings(&approve("de0b6b3a7640000"));
        assert_eq!(limited.len(), 1);
        assert!(limited[0].contains("1000000000000000000 base units"));
    }

    #[test]
    fn flags_approval_for_all_only_when_true() {
        let on = format!("0x{SET_APPROVAL_FOR_ALL}{:0>64}{:0>64}", "22", "1");
        let off = format!("0x{SET_APPROVAL_FOR_ALL}{:0>64}{:0>64}", "22", "0");
        assert_eq!(calldata_warnings(&on).len(), 1);
        assert!(calldata_warnings(&off).is_empty());
    }

    #[test]
    fn plain_calls_have_no_warnings() {
        assert!(calldata_warnings("0x").is_empty());
        assert!(calldata_warnings("0xd0e30db0").is_empty());
    }
}
