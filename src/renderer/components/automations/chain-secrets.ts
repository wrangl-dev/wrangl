/**
 * Project secrets the built-in Robinhood Chain tools (`chain_*` in the host
 * MCP server) read. Names must match `RPC_SECRET` / `COINGECKO_SECRET` in
 * `src-tauri/src/acp/host_mcp/chain_tools.rs`.
 */
export interface KnownSecret {
  name: string
  /** What the secret is for, shown in place of "Unused". */
  purpose: string
}

export const CHAIN_SECRETS: readonly KnownSecret[] = [
  { name: 'ROBINHOOD_RPC_URL', purpose: 'Robinhood Chain RPC' },
  { name: 'COINGECKO_API_KEY', purpose: 'Chain market data' }
]
