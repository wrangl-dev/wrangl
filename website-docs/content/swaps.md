---

title: Swaps
description: How agents quote and swap tokens on Robinhood Chain in Wrangl, through KyberSwap, with exact approvals and your signature on every step.
---

# Swaps

Agents can price and swap tokens on Robinhood Chain through the [KyberSwap](https://kyberswap.com) aggregator, which routes across the chain's DEXes. You sign every step.

## Get a quote

Ask: "how much ETH do I get for 25 USDG?". The agent calls `swap_quote` and gets the amount out, USD values, price impact and the DEXes in the route. Quotes are read-only and need no wallet. Use `ETH` for native ETH, or a token address.

Price impact above 3% comes with a warning.

## Swap

Ask the agent to do it. It calls `swap_tokens`, which needs a [connected wallet](/docs/wallet):

1. **Approval, if needed.** Selling a token (not ETH) needs an approval for the KyberSwap router. Wrangl asks you to approve **exactly** the amount you sell, never unlimited, and waits for it to confirm.
2. **The swap.** Wrangl builds the route for your address and asks you to sign the swap.

Both steps appear on Wrangl's signing page and in your own wallet. Each is simulated first, like every [proposal](/docs/wallet#when-an-agent-proposes-a-transaction).

## Slippage

Slippage is 0.5% by default. The agent may set up to 5%; anything higher is refused. If a swap fails because the price moved, ask for a new quote and try again.

## What is shared

To build a route, your wallet address and the trade (tokens and amount) are sent to KyberSwap. Wrangl only sends swaps to KyberSwap's known router contract; a route pointing anywhere else is refused.
