---

title: Agents
description: Pick any agent from the ACP Registry. Wrangl installs it, starts it in your project, and helps you sign in.
---

# Agents

Wrangl speaks ACP, the open [Agent Client Protocol](https://agentclientprotocol.com). Any agent listed in the public ACP Registry works: Claude Agent, Codex, Gemini CLI, GitHub Copilot, Cursor and many more. The list comes from the registry, so new agents appear without a Wrangl update. A cached copy is used when you are offline.

## Pick an agent

Open the agent picker in the chat box and choose one. The first time, Wrangl installs it:

- **npx agents** need [Node.js](https://nodejs.org) 18 or later.
- **uvx agents** need [uv](https://docs.astral.sh/uv/).
- **Native agents** are downloaded for your system and checked against the checksum the registry publishes.

The agent then starts in the project folder. Each chat has its own agent process.

## Sign in

Most agents need an account. If the agent asks you to sign in, a card in the chat offers its sign-in methods. Methods that run in a terminal open one right in the chat, for example `claude /login`. Finish there, then send your message again.

Your agent logins stay with the agent (its own config files). Wrangl does not store them.

## What agents get from Wrangl

Every chat also starts Wrangl's own tool server, so the agent can use the [chain tools](/docs/robinhood-chain), the [wallet](/docs/wallet) and [swaps](/docs/swaps). The agent never sees your RPC URL or API keys; the tool server uses them on its behalf.
