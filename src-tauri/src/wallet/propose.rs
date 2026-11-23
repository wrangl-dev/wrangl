//! `wallet_send_transaction`: check a proposed transaction, simulate it, queue it for the user,
//! and wait for their answer from the signing page.

use std::sync::Arc;

use serde_json::{json, Value};

use super::tools::{calldata_warnings, validate_transaction, WalletSendTransactionInput};
use super::{TxOutcome, WalletService};
use crate::chain::client::{rpc_batch, Sources};
use crate::chain::tools::hex_to_decimal;

pub const NOT_CONNECTED: &str = "No wallet is connected. Ask the user to open Wallet in Wrangl's \
sidebar and connect their wallet. Never ask for a private key or seed phrase.";

/// The RPC to simulate with: the user's own from Settings, else the public ones.
#[must_use]
pub fn sources_from_settings() -> Sources {
    let settings = crate::settings::SettingsStore::default().load();
    Sources::from_settings(
        settings.rpc_url().as_deref(),
        settings.coingecko_key().as_deref(),
    )
}

/// Withdraws a proposal if the request waiting for it goes away (the agent hung up).
struct WithdrawOnDrop<'a> {
    wallet: &'a WalletService,
    id: String,
    done: bool,
}

impl Drop for WithdrawOnDrop<'_> {
    fn drop(&mut self) {
        if !self.done {
            self.wallet.withdraw(&self.id);
            log::info!(
                "[wallet] proposal {} withdrawn: the agent stopped waiting",
                self.id
            );
        }
    }
}

/// Run the whole proposal. `Err` is a refusal the agent should read (nothing was shown).
pub async fn propose(
    wallet: &Arc<WalletService>,
    chat_id: &str,
    input: WalletSendTransactionInput,
    sources: &Sources,
) -> Result<Value, String> {
    let from = wallet.address().ok_or_else(|| NOT_CONNECTED.to_string())?;
    let tx = validate_transaction(input)?;

    let mut warnings = calldata_warnings(&tx.data);
    let mut call = json!({ "from": from, "to": tx.to, "value": tx.value_wei_hex });
    if tx.data != "0x" {
        call["data"] = json!(tx.data);
    }
    let gas_estimate = match rpc_batch(sources, &[("eth_estimateGas", json!([call]))]).await {
        Ok(mut replies) => match replies.pop() {
            Some(Ok(gas)) => gas.as_str().and_then(hex_to_decimal),
            Some(Err(reason)) => {
                log::info!("[wallet] proposal refused: simulation failed ({reason})");
                return Err(format!(
                    "Simulation failed, so nothing was shown to the user: {reason}. \
                     Check the amount, the balance of {from} and the calldata."
                ));
            }
            None => None,
        },
        Err(reason) => {
            warnings.push(format!(
                "Wrangl could not simulate this transaction ({reason}). Read your wallet's \
                 confirmation carefully."
            ));
            None
        }
    };

    let (id, waiting) = wallet.propose(chat_id, from, tx, warnings.clone(), gas_estimate.clone());
    let mut guard = WithdrawOnDrop {
        wallet,
        id: id.clone(),
        done: false,
    };
    if let Err(e) = wallet.open_signer() {
        log::warn!("[wallet] could not open the signing page: {e}");
    }
    log::info!("[wallet] proposal {id} waiting for the user");
    let outcome = waiting.await.unwrap_or(TxOutcome::Rejected);
    guard.done = true;
    log::info!("[wallet] proposal {id} ended: {}", outcome_label(&outcome));

    Ok(match outcome {
        TxOutcome::Sent(hash) => json!({
            "status": "sent",
            "hash": hash,
            "next": "Call chain_tx with this hash to check that it confirmed.",
            "warningsShown": warnings,
            "gasEstimate": gas_estimate,
        }),
        TxOutcome::Rejected => json!({
            "status": "rejected",
            "next": "The user did not sign. Do not retry unless they ask.",
        }),
        TxOutcome::Failed(error) => json!({ "status": "failed", "error": error }),
    })
}

fn outcome_label(outcome: &TxOutcome) -> &'static str {
    match outcome {
        TxOutcome::Sent(_) => "sent",
        TxOutcome::Rejected => "rejected",
        TxOutcome::Failed(_) => "failed",
    }
}
