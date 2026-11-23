---

title: Wrangl docs
description: Wrangl is a desktop app for ACP coding agents with tools for Robinhood Chain. Agents read the chain and prepare swaps; you sign every transaction in your own wallet.
---

# Wrangl docs

Wrangl is a desktop app that runs any ACP agent (Claude, Codex, Gemini CLI and the rest of the ACP Registry) in your projects, and gives those agents tools for Robinhood Chain. Agents can read the chain and prepare swaps. Nothing is sent until you sign it in your own wallet.

## Start here

1. [Install Wrangl](/docs/getting-started/install) on macOS, Windows or Linux.
2. [Open a project and start a chat](/docs/projects-and-chat).
3. [Pick an agent](/docs/agent-setup/install-agents) and sign in to it.
4. Ask it about the chain. The [chain tools](/docs/robinhood-chain) work without any setup.

## Going further

- [Settings](/docs/settings): your own RPC and a CoinGecko key.
- [Wallet](/docs/wallet): connect MetaMask or Rabby so agents can propose transactions.
- [Swaps](/docs/swaps): quotes and swaps through KyberSwap, signed by you.
- [Troubleshooting](/docs/troubleshooting) when something does not work.

## What Wrangl never does

- It never holds a private key. It keeps your wallet address and nothing else.
- It never sends a transaction on its own. Every one waits for your signature.
- It never routes your chats or keys through a Wrangl server. Agents, terminals and tools run on your machine.
