//! The Robinhood Chain tools of the host `wrangl` MCP server: what the child
//! advertises and forwards, and the pure helpers the parent uses to build
//! requests and read answers.
//!
//! Every tool is read-only. None signs, sends or holds a key: the user's
//! wallet stays outside Wrangl. The parent (`parent/chain.rs`) reads chain
//! data from the project's own `ROBINHOOD_RPC_URL` secret when the user set
//! one, else from the public RPC, and market data from GeckoTerminal (or
//! CoinGecko's on-chain API with the project's `COINGECKO_API_KEY`).

use rmcp::schemars;
use serde::{Deserialize, Serialize};

/// Robinhood Chain mainnet.
pub const CHAIN_ID: u64 = 4663;
/// The public mainnet RPC: rate-limited, no SLA.
pub const PUBLIC_RPC_URL: &str = "https://rpc.mainnet.chain.robinhood.com";
/// The project secret holding the user's own RPC endpoint.
pub const RPC_SECRET: &str = "ROBINHOOD_RPC_URL";
/// The project secret holding the user's CoinGecko API key (optional).
pub const COINGECKO_SECRET: &str = "COINGECKO_API_KEY";
/// GeckoTerminal's keyless API and CoinGecko's keyed on-chain API share
/// their paths under these roots.
pub const GECKOTERMINAL_API: &str = "https://api.geckoterminal.com/api/v2";
pub const COINGECKO_ONCHAIN_API: &str = "https://api.coingecko.com/api/v3/onchain";
/// The network slug both market APIs use for Robinhood Chain.
pub const MARKET_NETWORK: &str = "robinhood";

/// EIP-1967 implementation slot: `keccak256("eip1967.proxy.implementation") - 1`.
pub const EIP1967_IMPLEMENTATION_SLOT: &str =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/// The tool a `Chain` frame serves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChainTool {
    Status,
    Token,
    Balance,
    Tx,
    NewPools,
    Call,
}

impl ChainTool {
    /// The MCP tool name, for logs.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Status => "chain_status",
            Self::Token => "chain_token",
            Self::Balance => "chain_balance",
            Self::Tx => "chain_tx",
            Self::NewPools => "chain_new_pools",
            Self::Call => "chain_call",
        }
    }
}

/// Input of `chain_token`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ChainTokenInput {
    /// The token contract address (0x followed by 40 hex characters).
    pub address: String,
    /// Also fetch price, FDV and top pools from the market API. Default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market: Option<bool>,
}

/// Input of `chain_balance`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ChainBalanceInput {
    /// The wallet address to read. Watch-only: no key is involved.
    pub address: String,
    /// ERC-20 token addresses to read balances for (up to 20). The native
    /// ETH balance is always included.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tokens: Vec<String>,
}

/// Input of `chain_tx`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ChainTxInput {
    /// The transaction hash (0x followed by 64 hex characters).
    pub hash: String,
}

/// Input of `chain_new_pools`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ChainNewPoolsInput {
    /// Result page, 1 to 10. Default 1 (the newest pools).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
}

/// Input of `chain_call`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ChainCallInput {
    /// The contract to call.
    pub to: String,
    /// ABI-encoded calldata, 0x-prefixed hex (4-byte selector then
    /// arguments).
    pub data: String,
    /// Optional sender address the call is simulated from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

pub const STATUS_DESCRIPTION: &str = "Robinhood Chain health check: chain id, latest block, \
gas price in gwei, and whether the project's own RPC or the public one answered. Call it first \
when another chain_* tool fails. Returns JSON. Reads chain id 4663 through the project's ROBINHOOD_RPC_URL secret when the user set one \
(Automations tab > Project secrets), else the rate-limited public RPC. Read-only: nothing is signed or sent.";

pub const TOKEN_DESCRIPTION: &str = "Facts about a token contract on Robinhood Chain: name, \
symbol, decimals, total supply, owner (and whether ownership is renounced), bytecode size, \
proxy implementation (EIP-1967 slot or minimal clone), and which privileged functions the \
bytecode exposes (mint, pause, upgrade, ownership transfer). With market (default true) it adds \
price, FDV and top pools from GeckoTerminal. Flags are hints read from bytecode, not an audit: \
say so when you report them. Returns JSON. Reads chain id 4663 through the project's ROBINHOOD_RPC_URL secret when the user set one \
(Automations tab > Project secrets), else the rate-limited public RPC. Read-only: nothing is signed or sent.";

pub const BALANCE_DESCRIPTION: &str = "Watch-only balances of one wallet on Robinhood Chain: \
native ETH plus each listed ERC-20 token (symbol, decimals, raw and formatted amount). Never \
ask the user for a private key or seed phrase; an address is all this needs. Returns JSON. Reads chain id 4663 through the project's ROBINHOOD_RPC_URL secret when the user set one \
(Automations tab > Project secrets), else the rate-limited public RPC. Read-only: nothing is signed or sent.";

pub const TX_DESCRIPTION: &str = "One Robinhood Chain transaction and its receipt: status, \
block, from, to, value in ETH, gas used, the 4-byte method selector, the created contract if \
any, and the log count. Returns JSON. Reads chain id 4663 through the project's ROBINHOOD_RPC_URL secret when the user set one \
(Automations tab > Project secrets), else the rate-limited public RPC. Read-only: nothing is signed or sent.";

pub const NEW_POOLS_DESCRIPTION: &str = "The newest DEX pools on Robinhood Chain from \
GeckoTerminal: name, pool address, DEX, created time, liquidity (USD), 24h volume, 24h \
buys/sells and the base token address. New pools are often scams; pair this with chain_token \
before calling anything safe. Returns JSON.";

pub const CALL_DESCRIPTION: &str = "Raw read-only eth_call against a Robinhood Chain \
contract: pass ABI-encoded calldata, get the hex return data (or the revert). Use it to read a \
view function the other tools do not cover, or to simulate a call before the user signs it in \
their own wallet. Returns JSON. Reads chain id 4663 through the project's ROBINHOOD_RPC_URL secret when the user set one \
(Automations tab > Project secrets), else the rate-limited public RPC. Read-only: nothing is signed or sent.";

// ---------------------------------------------------------------------------
// ABI selectors (verified against keccak256 of the signature in the tests).

pub const SEL_NAME: &str = "06fdde03"; // name()
pub const SEL_SYMBOL: &str = "95d89b41"; // symbol()
pub const SEL_DECIMALS: &str = "313ce567"; // decimals()
pub const SEL_TOTAL_SUPPLY: &str = "18160ddd"; // totalSupply()
pub const SEL_OWNER: &str = "8da5cb5b"; // owner()
pub const SEL_BALANCE_OF: &str = "70a08231"; // balanceOf(address)

/// Privileged functions worth flagging when the bytecode dispatches them.
pub const PRIVILEGED: &[(&str, &str)] = &[
    ("40c10f19", "mint(address,uint256)"),
    ("8456cb59", "pause()"),
    ("3f4ba83a", "unpause()"),
    ("3659cfe6", "upgradeTo(address)"),
    ("4f1ef286", "upgradeToAndCall(address,bytes)"),
    ("f2fde38b", "transferOwnership(address)"),
    ("715018a6", "renounceOwnership()"),
];

// ---------------------------------------------------------------------------
// Validation.

fn is_hex(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// A 0x-prefixed 20-byte address, lowercased.
pub fn parse_address(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    match trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        Some(body) if body.len() == 40 && is_hex(body) => Ok(format!("0x{}", body.to_lowercase())),
        _ => Err(format!(
            "`{trimmed}` is not an address (0x followed by 40 hex characters)"
        )),
    }
}

/// A 0x-prefixed 32-byte transaction hash, lowercased.
pub fn parse_tx_hash(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    match trimmed.strip_prefix("0x") {
        Some(body) if body.len() == 64 && is_hex(body) => Ok(format!("0x{}", body.to_lowercase())),
        _ => Err(format!(
            "`{trimmed}` is not a transaction hash (0x followed by 64 hex characters)"
        )),
    }
}

/// 0x-prefixed calldata with an even number of hex digits and at least a
/// selector.
pub fn parse_calldata(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    match trimmed.strip_prefix("0x") {
        Some(body) if body.len() >= 8 && body.len() % 2 == 0 && is_hex(body) => {
            Ok(format!("0x{}", body.to_lowercase()))
        }
        _ => Err("data must be 0x-prefixed hex with at least a 4-byte selector".to_string()),
    }
}

// ---------------------------------------------------------------------------
// ABI encoding and decoding.

/// Calldata for `selector` with one address argument.
#[must_use]
pub fn call_with_address(selector: &str, address: &str) -> String {
    let body = address.trim_start_matches("0x");
    format!("0x{selector}{body:0>64}")
}

/// Hex digits of a 0x string (no prefix), or None when it is not hex.
fn hex_body(value: &str) -> Option<&str> {
    let body = value.strip_prefix("0x")?;
    is_hex(body).then_some(body)
}

/// Decimal digits of an unsigned big-endian hex number of any width.
#[must_use]
pub fn hex_to_decimal(hex: &str) -> Option<String> {
    let body = hex_body(hex)?.trim_start_matches('0');
    if body.is_empty() {
        return Some("0".to_string());
    }
    // Little-endian base-1e9 limbs.
    let mut limbs: Vec<u64> = vec![0];
    for digit in body.chars() {
        let mut carry = u64::from(digit.to_digit(16)?);
        for limb in &mut limbs {
            let value = *limb * 16 + carry;
            *limb = value % 1_000_000_000;
            carry = value / 1_000_000_000;
        }
        if carry > 0 {
            limbs.push(carry);
        }
    }
    let mut out = limbs.last().map(u64::to_string).unwrap_or_default();
    for limb in limbs.iter().rev().skip(1) {
        out.push_str(&format!("{limb:09}"));
    }
    Some(out)
}

/// `raw` (decimal digits) scaled down by `decimals`, trailing zeros
/// trimmed, e.g. ("1500000", 6) -> "1.5".
#[must_use]
pub fn format_units(raw: &str, decimals: u32) -> String {
    let decimals = decimals as usize;
    if decimals == 0 {
        return raw.to_string();
    }
    let padded = format!("{raw:0>width$}", width = decimals + 1);
    let (whole, fraction) = padded.split_at(padded.len() - decimals);
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        whole.to_string()
    } else {
        format!("{whole}.{fraction}")
    }
}

/// A uint256 return value as a u64, when it fits.
#[must_use]
pub fn decode_u64(hex: &str) -> Option<u64> {
    let body = hex_body(hex)?;
    if body.is_empty() || body.len() > 64 {
        return None;
    }
    let digits = body.trim_start_matches('0');
    if digits.len() > 16 {
        return None;
    }
    if digits.is_empty() {
        return Some(0);
    }
    u64::from_str_radix(digits, 16).ok()
}

/// An address return value (the low 20 bytes of the first word).
#[must_use]
pub fn decode_address(hex: &str) -> Option<String> {
    let body = hex_body(hex)?;
    if body.len() < 64 {
        return None;
    }
    Some(format!("0x{}", &body[24..64]))
}

/// A string return value: the dynamic ABI `string`, or a right-padded
/// `bytes32` (old tokens such as MKR). Non-UTF-8 bytes are replaced.
#[must_use]
pub fn decode_string(hex: &str) -> Option<String> {
    let body = hex_body(hex)?;
    let bytes = decode_hex_bytes(body)?;
    if bytes.len() == 32 {
        let end = bytes.iter().position(|&b| b == 0).unwrap_or(32);
        return Some(String::from_utf8_lossy(&bytes[..end]).into_owned());
    }
    if bytes.len() < 64 {
        return None;
    }
    let offset = usize::try_from(word_u64(&bytes[0..32])?).ok()?;
    let len_end = offset.checked_add(32)?;
    let len = usize::try_from(word_u64(bytes.get(offset..len_end)?)?).ok()?;
    let data = bytes.get(len_end..len_end.checked_add(len)?)?;
    Some(String::from_utf8_lossy(data).into_owned())
}

fn word_u64(word: &[u8]) -> Option<u64> {
    if word.len() != 32 || word[..24].iter().any(|&b| b != 0) {
        return None;
    }
    Some(u64::from_be_bytes(word[24..32].try_into().ok()?))
}

/// Bytes of an even-length hex body.
#[must_use]
pub fn decode_hex_bytes(body: &str) -> Option<Vec<u8>> {
    if body.len() % 2 != 0 {
        return None;
    }
    (0..body.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&body[i..i + 2], 16).ok())
        .collect()
}

// ---------------------------------------------------------------------------
// Bytecode reading.

/// What a contract's runtime bytecode reveals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CodeFacts {
    pub size_bytes: usize,
    /// The implementation a minimal proxy (EIP-1167 or a known clone layout)
    /// forwards to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clone_of: Option<String>,
    /// Privileged function signatures whose selectors the code pushes.
    pub privileged_functions: Vec<&'static str>,
}

/// The 4-byte constants the code pushes with PUSH4 (0x63), walking opcodes
/// so PUSH data is never read as an opcode.
#[must_use]
pub fn push4_selectors(code: &[u8]) -> Vec<String> {
    let mut found = Vec::new();
    let mut i = 0;
    while i < code.len() {
        let op = code[i];
        if (0x60..=0x7f).contains(&op) {
            let width = usize::from(op - 0x5f);
            if op == 0x63 && i + 4 < code.len() {
                found.push(
                    code[i + 1..i + 5]
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect(),
                );
            }
            i += width + 1;
        } else {
            i += 1;
        }
    }
    found
}

/// Clone prefixes followed by the 20-byte implementation address.
const CLONE_PREFIXES: &[&str] = &[
    "363d3d373d3d3d363d73",   // EIP-1167
    "3d3d3d3d363d3d37363d73", // layout seen on live Robinhood Chain clones
];

/// Facts from 0x-prefixed runtime bytecode.
#[must_use]
pub fn code_facts(code_hex: &str) -> CodeFacts {
    let body = hex_body(code_hex).unwrap_or_default().to_lowercase();
    let bytes = decode_hex_bytes(&body).unwrap_or_default();
    let clone_of = CLONE_PREFIXES.iter().find_map(|prefix| {
        let start = body.find(prefix)? + prefix.len();
        body.get(start..start + 40).map(|addr| format!("0x{addr}"))
    });
    let pushed = push4_selectors(&bytes);
    let privileged_functions = PRIVILEGED
        .iter()
        .filter(|(selector, _)| pushed.iter().any(|p| p == selector))
        .map(|(_, signature)| *signature)
        .collect();
    CodeFacts {
        size_bytes: bytes.len(),
        clone_of,
        privileged_functions,
    }
}

/// True for the zero address and the dead address, the usual "renounced"
/// owners.
#[must_use]
pub fn is_burn_owner(address: &str) -> bool {
    let body = address.trim_start_matches("0x");
    body.chars().all(|c| c == '0')
        || body.eq_ignore_ascii_case("000000000000000000000000000000000000dead")
}
