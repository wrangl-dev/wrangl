import { readFileSync } from 'node:fs'

const FIELDS = ['tag', 'url', 'sha256']

export function parsePin(text) {
  const pin = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const eq = line.indexOf('=')
    if (eq <= 0) throw new Error(`corral.pin: malformed line "${line}"`)
    const key = line.slice(0, eq)
    if (!FIELDS.includes(key)) throw new Error(`corral.pin: unknown field "${key}"`)
    if (key in pin) throw new Error(`corral.pin: duplicate field "${key}"`)
    pin[key] = line.slice(eq + 1)
  }
  for (const key of FIELDS) {
    if (!pin[key]) throw new Error(`corral.pin: missing field "${key}"`)
  }
  if (!/^[0-9a-f]{64}$/.test(pin.sha256)) {
    throw new Error('corral.pin: sha256 must be 64 lowercase hex characters')
  }
  if (!pin.url.startsWith('https://')) throw new Error('corral.pin: url must be https')
  return pin
}

export function readPin(path) {
  return parsePin(readFileSync(path, 'utf8'))
}

/**
 * What the `corral-mcp` dependency pins, `{ kind: 'tag' | 'rev' | 'path', value }`,
 * or `null` when Cargo.toml has no such dependency. A `path` dependency is the
 * vendored source in the repository; a git dependency pinned by neither a tag
 * nor a rev (a branch) is an error: it is not reproducible.
 */
export function cargoCorralMcpRef(cargoToml) {
  for (const line of cargoToml.split(/\r?\n/)) {
    if (!/^\s*corral-mcp\s*=/.test(line)) continue
    const tag = /\btag\s*=\s*"([^"]+)"/.exec(line)
    if (tag) return { kind: 'tag', value: tag[1] }
    const rev = /\brev\s*=\s*"([^"]+)"/.exec(line)
    if (rev) return { kind: 'rev', value: rev[1] }
    const path = /\bpath\s*=\s*"([^"]+)"/.exec(line)
    if (path && !/\bgit\s*=/.test(line)) return { kind: 'path', value: path[1] }
    throw new Error('Cargo.toml: corral-mcp dependency has no tag or rev')
  }
  return null
}
