---

title: Settings
description: Set your own Robinhood Chain RPC and an optional CoinGecko API key in Wrangl.
---

# Settings

Open **Settings** from the sidebar. There are two things to set, both optional.

## Robinhood Chain RPC

The chain tools read through this RPC. Without one they use the public RPC, which is rate-limited and blocked by some internet providers (Wrangl falls back to PublicNode and dRPC then). For steady use, get an endpoint from Alchemy, Chainstack or QuickNode.

1. Paste the full URL, for example `https://robinhood-mainnet.g.alchemy.com/v2/<key>`.
2. Click **Test**. Wrangl asks the RPC for its chain id and latest block and shows the answer.
3. Click **Save**.

After saving, Settings shows only the host ("Using your RPC at robinhood-mainnet.g.alchemy.com"), never the key. New chats use it; chats that are already open keep the RPC they started with. **Remove my RPC** goes back to the public RPC.

## CoinGecko API key

Prices and pools come from GeckoTerminal for free. A CoinGecko API key (it starts with `CG-`) gives higher limits. Paste it and save; **Remove key** deletes it.

## Where they are stored

Both values are saved in Wrangl's settings file in your user's app data folder, on your machine only. They are passed to the local tool server, never to the agent and never to a Wrangl server.
