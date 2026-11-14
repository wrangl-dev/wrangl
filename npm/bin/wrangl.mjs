#!/usr/bin/env node
// `npx wrangl` / `npm i -g wrangl`: runs the same installer as the website's
// curl (macOS, Linux) or PowerShell (Windows) one-liner. The app itself comes
// from GitHub Releases and is checked against SHA256SUMS.txt by that script.

import { spawnSync } from 'node:child_process'

const RAW = 'https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts'

const [command, args] =
  process.platform === 'win32'
    ? [
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${RAW}/install.ps1 | iex`]
      ]
    : ['bash', ['-c', `curl -fsSL ${RAW}/install.sh | bash`]]

const result = spawnSync(command, args, { stdio: 'inherit' })
if (result.error) {
  console.error(`wrangl: could not start ${command}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
