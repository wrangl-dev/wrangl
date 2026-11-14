//! The read-only `chain_*` tools: each forwards its arguments to the parent
//! as a `Chain` frame and returns the parent's JSON verbatim.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::{tool, tool_router};
use serde_json::Value;

use super::WranglPlanServer;
use crate::acp::host_mcp::chain_tools::{
    ChainBalanceInput, ChainCallInput, ChainNewPoolsInput, ChainTokenInput, ChainTool,
    ChainTxInput, BALANCE_DESCRIPTION, CALL_DESCRIPTION, NEW_POOLS_DESCRIPTION, STATUS_DESCRIPTION,
    TOKEN_DESCRIPTION, TX_DESCRIPTION,
};
use crate::acp::host_mcp::{FrameKind, FrameRequest};

/// The parent's own HTTP timeout is 20 s per request; a token lookup makes
/// an RPC batch and a market call one after the other.
const ROUND_TRIP: std::time::Duration = std::time::Duration::from_secs(50);

impl WranglPlanServer {
    async fn chain(&self, tool: ChainTool, input: Option<Value>) -> CallToolResult {
        let request = FrameRequest {
            chain_tool: Some(tool),
            chain_input: input,
            ..self.frame(FrameKind::Chain)
        };
        self.text_call(tool.name(), request, ROUND_TRIP).await
    }
}

fn arguments<T: serde::Serialize>(input: T) -> Option<Value> {
    serde_json::to_value(input).ok()
}

#[tool_router(router = chain_tool_router, vis = "pub(super)")]
impl WranglPlanServer {
    #[tool(
        name = "chain_status",
        description = STATUS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_status(&self) -> CallToolResult {
        self.chain(ChainTool::Status, None).await
    }

    #[tool(
        name = "chain_token",
        description = TOKEN_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_token(&self, Parameters(input): Parameters<ChainTokenInput>) -> CallToolResult {
        self.chain(ChainTool::Token, arguments(input)).await
    }

    #[tool(
        name = "chain_balance",
        description = BALANCE_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_balance(
        &self,
        Parameters(input): Parameters<ChainBalanceInput>,
    ) -> CallToolResult {
        self.chain(ChainTool::Balance, arguments(input)).await
    }

    #[tool(
        name = "chain_tx",
        description = TX_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_tx(&self, Parameters(input): Parameters<ChainTxInput>) -> CallToolResult {
        self.chain(ChainTool::Tx, arguments(input)).await
    }

    #[tool(
        name = "chain_new_pools",
        description = NEW_POOLS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_new_pools(
        &self,
        Parameters(input): Parameters<ChainNewPoolsInput>,
    ) -> CallToolResult {
        self.chain(ChainTool::NewPools, arguments(input)).await
    }

    #[tool(
        name = "chain_call",
        description = CALL_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = true)
    )]
    async fn chain_call(&self, Parameters(input): Parameters<ChainCallInput>) -> CallToolResult {
        self.chain(ChainTool::Call, arguments(input)).await
    }
}
