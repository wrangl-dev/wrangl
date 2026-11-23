---

title: Troubleshooting
description: Fixes for common Wrangl problems - blocked RPC, agents that will not start or sign in, apps that will not open, wallet and swap errors.
---

# Troubleshooting

## Install and launch

**macOS says Wrangl is damaged or cannot be opened.** Wrangl is not notarized yet. Run `xattr -dr com.apple.quarantine "/Applications/Wrangl.app"` once. The install script does this for you.

**Windows SmartScreen warns about the installer.** The builds are not code-signed yet. Click **More info → Run anyway**, or install with the PowerShell command from [Install](/docs/getting-started/install).

**Linux: the window is blank or the app will not start.** Wrangl needs WebKitGTK 2.40 or later. Update your system, or use Debian 12, Ubuntu 24.04 or newer.

## Agents

**The agent list is empty.** Wrangl reads the ACP Registry from the internet and caches it. Check your connection and open the picker again.

**An agent fails to install.** npx agents need Node.js 18 or later, uvx agents need uv. Install the one it needs and try again. See [Agents](/docs/agent-setup/install-agents).

**"Authentication required".** The agent needs you to sign in. Use the sign-in card in the chat; terminal sign-ins open right there. Then send your message again.

**The agent is stuck.** Press the stop button. If it still does not answer, start a new chat; each chat has its own agent process.

## Chain tools

**Chain tools time out or fail.** Some internet providers block the official public RPC. Wrangl tries the PublicNode and dRPC fallbacks by itself; `chain_status` shows which RPC answered. For steady use, set your own RPC in [Settings](/docs/settings) and click **Test**.

**Prices or pools are missing.** GeckoTerminal's free limits may be reached. Wait a minute, or add a CoinGecko key in [Settings](/docs/settings).

## Wallet and swaps

**The signing page does not open.** Open the Wallet page and click **Open signing page**. It runs on `127.0.0.1` on your machine, so a VPN or proxy that intercepts local addresses can block it.

**"Simulation failed".** The transaction would fail on the chain, so Wrangl did not show it to you. Common causes: not enough ETH for gas, not enough of the token, or an amount with too many decimals.

**A swap fails after signing.** The price probably moved more than the slippage. Ask for a new quote and try again. See [Swaps](/docs/swaps).

Still stuck? [Report a problem](/docs/troubleshooting/report-a-problem).
