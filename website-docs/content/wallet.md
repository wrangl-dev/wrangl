---

title: Wallet
description: Connect MetaMask, Rabby or another browser wallet to Wrangl. Wrangl keeps only your address; agents propose, you sign.
---

# Wallet

Wrangl never holds a private key. You connect a browser wallet (MetaMask, Rabby or any other injected wallet) and Wrangl keeps only its address. Agents can propose transactions; nothing is sent until you confirm it in your wallet.

## Connect

1. Open **Wallet** from the sidebar and click **Connect wallet**.
2. Your browser opens a signing page served by Wrangl on your own machine (a `127.0.0.1` address).
3. Connect your wallet there. The page asks your wallet to switch to Robinhood Chain, and to add it if it does not know it yet.

The Wallet page then shows your address. **Disconnect** forgets it.

## When an agent proposes a transaction

An agent calls `wallet_send_transaction` (or [`swap_tokens`](/docs/swaps)). Before you see anything, Wrangl:

- checks the transaction is complete and says what it does, and sets it to come from your connected address,
- simulates it on the chain. If the simulation fails, the proposal is refused and the agent is told why,
- adds warnings, for example for a token approval or an **unlimited** approval.

The proposal then appears under **Waiting for your signature** with the amount, the recipient, the gas estimate and any warnings, and the signing page opens. From there:

- **Send** on the signing page: your wallet shows its own confirmation. Confirm there and the agent gets the transaction hash.
- **Reject**, on the signing page, on the Wallet page or in your wallet: the agent is told you said no.

A proposal also ends if the agent stops waiting or the chat ends.

## Rules worth knowing

- Read your wallet's own confirmation, not just Wrangl's. Your wallet is the last word.
- An agent never needs your seed phrase or private key. If one asks, say no.
- Unlimited approvals get a loud warning. Wrangl's own swaps never ask for one.
