//! `Wallet` frames: the connected address, and transaction proposals the
//! user signs (or rejects) in their own wallet on the local signing page.
//!
//! A proposal is simulated first (`eth_estimateGas` from the connected
//! address); one that would revert is refused before the user ever sees it.
//! Then the call parks, like `ask_user`, until the user answers, the turn
//! ends, or the agent hangs up.

use std::future::Future;

use serde_json::{json, Value};

use super::ask::ask_idle_heartbeat;
use super::chain::rpc_batch;
use super::HostPlanServer;
use crate::acp::host_mcp::chain_tools::hex_to_decimal;
use crate::acp::host_mcp::wallet_tools::{
    calldata_warnings, validate_transaction, WalletSendTransactionInput, WalletTool,
};
use crate::acp::host_mcp::FrameReply;
use crate::wallet::TxOutcome;

const NOT_CONNECTED: &str = "No wallet is connected. Ask the user to open Wallet in Wrangl's \
rail and connect MetaMask or another browser wallet. Never ask for a private key or seed phrase.";

impl HostPlanServer {
    pub(super) async fn wallet_call(
        &self,
        agent_id: &str,
        session_id: &str,
        tool: Option<WalletTool>,
        input: Option<Value>,
        hung_up: impl Future<Output = ()>,
    ) -> FrameReply {
        let Some(wallet) = crate::wallet::installed() else {
            return FrameReply::err("the wallet is not available on this Wrangl host");
        };
        match tool {
            None => FrameReply::err("a wallet frame needs a tool"),
            Some(WalletTool::Address) => FrameReply::ok_with(match wallet.address() {
                Some(address) => json!({ "connected": true, "address": address, "chainId": 4663 }),
                None => json!({ "connected": false, "hint": NOT_CONNECTED }),
            }),
            Some(WalletTool::SendTransaction) => {
                let input = match input.map(serde_json::from_value::<WalletSendTransactionInput>) {
                    Some(Ok(input)) => input,
                    Some(Err(e)) => return FrameReply::err(format!("invalid arguments: {e}")),
                    None => return FrameReply::err("wallet_send_transaction needs arguments"),
                };
                self.propose_transaction(&wallet, agent_id, session_id, input, hung_up)
                    .await
            }
        }
    }

    async fn propose_transaction(
        &self,
        wallet: &std::sync::Arc<crate::wallet::WalletService>,
        agent_id: &str,
        session_id: &str,
        input: WalletSendTransactionInput,
        hung_up: impl Future<Output = ()>,
    ) -> FrameReply {
        let Some(from) = wallet.address() else {
            return FrameReply::err(NOT_CONNECTED);
        };
        let tx = match validate_transaction(input) {
            Ok(tx) => tx,
            Err(e) => return FrameReply::err(e),
        };

        let mut warnings = calldata_warnings(&tx.data);
        let sources = self.chain_sources(session_id).await;
        let mut call = json!({ "from": from, "to": tx.to, "value": tx.value_wei_hex });
        if tx.data != "0x" {
            call["data"] = json!(tx.data);
        }
        let gas_estimate = match rpc_batch(&sources, &[("eth_estimateGas", json!([call]))]).await {
            Ok(mut replies) => match replies.pop() {
                Some(Ok(gas)) => gas.as_str().and_then(hex_to_decimal),
                Some(Err(reason)) => {
                    log::info!("[wallet] proposal refused: simulation failed ({reason})");
                    return FrameReply::err(format!(
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

        let (id, waiting) =
            wallet.propose(session_id, from, tx, warnings.clone(), gas_estimate.clone());
        if let Err(e) = wallet.open_signer() {
            log::warn!("[wallet] could not open the signing page: {e}");
        }
        log::info!(
            "[wallet] proposal {id} waiting for the user in session {}",
            crate::logging::redact_session_id(session_id)
        );

        // The user may take a while: keep the turn's idle deadline alive.
        let idle_signal = self.idle_signals.lock().get(agent_id).cloned();
        let heartbeat = ask_idle_heartbeat(crate::acp::manager::turn_idle_timeout());
        if let Some(signal) = &idle_signal {
            signal(session_id);
        }
        let mut waiting = waiting;
        tokio::pin!(hung_up);
        let outcome = loop {
            tokio::select! {
                answered = &mut waiting => break answered.unwrap_or(TxOutcome::Rejected),
                () = &mut hung_up => {
                    wallet.withdraw(&id);
                    log::info!("[wallet] proposal {id} withdrawn: the agent hung up");
                    break TxOutcome::Rejected;
                }
                () = tokio::time::sleep(heartbeat) => {
                    if let Some(signal) = &idle_signal {
                        signal(session_id);
                    }
                }
            }
        };
        log::info!("[wallet] proposal {id} ended: {}", outcome_label(&outcome));
        FrameReply::ok_with(match outcome {
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
}

fn outcome_label(outcome: &TxOutcome) -> &'static str {
    match outcome {
        TxOutcome::Sent(_) => "sent",
        TxOutcome::Rejected => "rejected",
        TxOutcome::Failed(_) => "failed",
    }
}
