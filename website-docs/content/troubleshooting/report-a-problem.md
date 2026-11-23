---

title: Report a problem
description: How to report a Wrangl bug on GitHub, what to include, and what never to include.
---

# Report a problem

Open an issue on GitHub: [github.com/wrangl-dev/wrangl/issues/new](https://github.com/wrangl-dev/wrangl/issues/new).

## Include

- your system (for example Windows 11, macOS 15 on Apple silicon, Ubuntu 24.04),
- the Wrangl version, from the release you installed,
- the agent you used, if it is about a chat,
- what you did, what you expected, and what happened instead,
- the exact error text, or a screenshot.

## Never include

- your seed phrase or private key (Wrangl never needs them, and neither do we),
- your RPC URL with its key, or your CoinGecko key,
- agent login tokens.

Wallet addresses and transaction hashes are public, so those are fine, and they help.

## Security issues

If you found a way to move funds without the user's signature, or to read keys, do not open a public issue. Use [GitHub's private vulnerability report](https://github.com/wrangl-dev/wrangl/security/advisories/new) instead.
