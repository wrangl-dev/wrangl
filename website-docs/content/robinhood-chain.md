---

title: Chain tools
description: The Robinhood Chain tools every agent gets in Wrangl - status, token checks, balances, transactions, new pools and raw calls - and the RPCs they read through.
---

# Chain tools

Every chat starts Wrangl's tool server, so any agent can read Robinhood Chain (chain id 4663) without setup. Ask in plain words: "is this token safe?", "what are the newest pools?", "what is in this wallet?".

## Read-only tools

| Tool              | What it returns                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chain_status`    | Chain id, latest block, gas price, and which RPC answered.                                                                                                                    |
| `chain_token`     | Name, supply, owner and whether it is renounced, whether it is a proxy, and mint, pause, upgrade or ownership functions found in the bytecode. Plus price, FDV and top pools. |
| `chain_balance`   | ETH and token balances of any address.                                                                                                                                        |
| `chain_tx`        | A transaction and its receipt: status, from, to, value, gas, method.                                                                                                          |
| `chain_new_pools` | The newest DEX pools with liquidity, 24h volume, buys and sells.                                                                                                              |
| `chain_call`      | A raw read-only contract call, for anything the others miss.                                                                                                                  |
| `swap_quote`      | A swap price through KyberSwap. See [Swaps](/docs/swaps).                                                                                                                     |
| `wallet_address`  | The address of your connected wallet, if any.                                                                                                                                 |

These only read. They cannot move funds.

## Tools that ask you

| Tool                      | What happens                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `wallet_send_transaction` | Proposes a transaction. It waits in the [wallet](/docs/wallet) until you sign or reject it.       |
| `swap_tokens`             | Asks you to approve the exact amount, if needed, then to sign the swap. See [Swaps](/docs/swaps). |

## Where the data comes from

- **On-chain reads** go through an RPC. With no RPC set, Wrangl uses the official public RPC and, if it does not answer, the keyless public fallbacks from PublicNode and dRPC. If you set [your own RPC](/docs/settings), it is used alone.
- **Prices and pools** come from GeckoTerminal for free. A [CoinGecko key](/docs/settings) raises the limits.
- **Swap quotes** come from the KyberSwap aggregator.

Your RPC URL and keys stay in Wrangl. The agent sees tool results, never the URL.

## A token check is not advice

`chain_token` reads facts from the contract: who owns it, what functions it has. A clean result does not make a token safe, and a warning does not make it a scam. Read what the agent reports and decide yourself.
