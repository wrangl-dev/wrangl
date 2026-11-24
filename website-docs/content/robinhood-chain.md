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

## Research tools

For digging into the trenches: new launches, who is buying, and whether a token holds up.

| Tool             | What it returns                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token_report`   | A full check in one call: contract facts, burned supply, holders and developer, the main pool's market and trading, Pons launch details, and risk flags with reasons. |
| `token_search`   | Tokens and pools by name, symbol or address.                                                                                                                          |
| `pools_trending` | What is trending over 5m, 1h, 6h or 24h.                                                                                                                              |
| `pools_top`      | The biggest pools by 24h volume or transactions, on one launchpad or all.                                                                                             |
| `launchpads`     | Every DEX and launchpad on Robinhood Chain (Pons, Clanker, Virtuals, Bankr, Uniswap and more).                                                                        |
| `launches`       | The newest pools, across all DEXes or on one launchpad.                                                                                                               |
| `pool_info`      | One pool: price, liquidity, FDV, and change, volume, buys, sells, buyers and sellers for 5m to 24h.                                                                   |
| `pool_trades`    | The latest trades: totals, the largest trades, the wallets buying and selling the most, or one wallet's trades.                                                       |
| `price_chart`    | Candles by minute, hour or day, with change, high, low, drop from the high and volatility.                                                                            |
| `token_profile`  | Holder count and concentration, developer and their holding, score, honeypot flag, socials, launchpad progress, pools.                                                |
| `pons_launch`    | A Pons coin's creator, curve pool, launch block and how full the curve is.                                                                                            |
| `dev_launches`   | Every Pons launch by a creator, with each token's status. Serial launchers are a common warning sign.                                                                 |

Try: "what is launching on Pons right now, and which ones look risky?", or the **Research** button next to a token in your [watchlist](/docs/settings).

`pons_launch` and `dev_launches` read the chain's launch history, which only the official RPC serves far back. If your network blocks it, they say so; a VPN helps.

Risk flags follow fixed rules: mint, pause, blacklist or upgrade functions with a live owner, a proxy, the top 10 holders above 50%, a developer holding 5% or more, a creator with 2 or more Pons launches, market cap above 100 times liquidity, under $5,000 of liquidity, and many buys with no sells.

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
