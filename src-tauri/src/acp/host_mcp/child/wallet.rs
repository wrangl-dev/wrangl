//! The `wallet_*` tools: each forwards its arguments to the parent as a
//! `Wallet` frame. `wallet_send_transaction` waits for the user like
//! `ask_user` does: no client-side timeout, and a client cancel hangs up on
//! the parent so the proposal leaves the signing page.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::{tool, tool_router};

use super::{exchange_frame, text_result, WranglPlanServer};
use crate::acp::host_mcp::wallet_tools::{
    WalletSendTransactionInput, WalletTool, ADDRESS_DESCRIPTION, SEND_TRANSACTION_DESCRIPTION,
};
use crate::acp::host_mcp::{FrameKind, FrameRequest};

const ADDRESS_ROUND_TRIP: std::time::Duration = std::time::Duration::from_secs(10);

impl WranglPlanServer {
    fn wallet_frame(&self, tool: WalletTool, input: Option<serde_json::Value>) -> FrameRequest {
        FrameRequest {
            wallet_tool: Some(tool),
            wallet_input: input,
            ..self.frame(FrameKind::Wallet)
        }
    }
}

#[tool_router(router = wallet_tool_router, vis = "pub(super)")]
impl WranglPlanServer {
    #[tool(
        name = "wallet_address",
        description = ADDRESS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn wallet_address(&self) -> CallToolResult {
        let request = self.wallet_frame(WalletTool::Address, None);
        self.text_call(WalletTool::Address.name(), request, ADDRESS_ROUND_TRIP)
            .await
    }

    #[tool(
        name = "wallet_send_transaction",
        description = SEND_TRANSACTION_DESCRIPTION,
        annotations(read_only_hint = false, destructive_hint = true, open_world_hint = true)
    )]
    async fn wallet_send_transaction(
        &self,
        Parameters(input): Parameters<WalletSendTransactionInput>,
        cancelled: tokio_util::sync::CancellationToken,
    ) -> CallToolResult {
        let request = self.wallet_frame(
            WalletTool::SendTransaction,
            serde_json::to_value(input).ok(),
        );
        let reply = tokio::select! {
            reply = exchange_frame(&self.config, request) => reply,
            () = cancelled.cancelled() => {
                return CallToolResult::error(vec![ContentBlock::text(
                    "wallet_send_transaction cancelled by the client",
                )]);
            }
        };
        match reply {
            Ok(reply) => text_result(reply),
            Err(error) => {
                eprintln!("[host-mcp-child] wallet_send_transaction: {error}");
                CallToolResult::error(vec![ContentBlock::text(format!(
                    "the Wrangl host is unreachable: {error}"
                ))])
            }
        }
    }
}
