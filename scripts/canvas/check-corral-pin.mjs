#!/usr/bin/env node
// Spine AD-24: canvas/corral.pin and the corral-mcp Cargo dependency name
// the same corral source. A `path =` dependency must be the vendored copy in
// vendor/corral (the source the pinned bundle is built from). A `tag =`
// dependency must equal the pin's tag; any mismatch fails the check. A `rev =`
// dependency cannot be compared with a release tag, so it only warns.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cargoCorralMcpRef, readPin } from './corral-pin.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const pinPath = process.argv[2] ?? resolve(root, 'canvas', 'corral.pin')
const cargoPath = process.argv[3] ?? resolve(root, 'src-tauri', 'Cargo.toml')

const pin = readPin(pinPath)
const ref = cargoCorralMcpRef(readFileSync(cargoPath, 'utf8'))

if (ref === null) {
  console.log(
    `corral pin check skipped: ${cargoPath} has no corral-mcp dependency yet (pin tag ${pin.tag})`
  )
} else if (ref.kind === 'path') {
  const crate = resolve(dirname(cargoPath), ref.value)
  const vendored = resolve(root, 'vendor', 'corral', 'crates', 'mcp')
  if (crate !== vendored) {
    console.error(
      `corral pin mismatch: corral-mcp is a path dependency on ${crate}, not the vendored ${vendored}`
    )
    process.exit(1)
  }
  console.log(`corral-mcp is the vendored source in vendor/corral; bundle pin tag ${pin.tag}`)
} else if (ref.kind === 'rev') {
  console.warn(
    `corral pin check warning: corral-mcp is pinned by rev ${ref.value}, not a tag; it cannot be compared with canvas/corral.pin tag ${pin.tag}. Move the dependency to the vendored path or a corral-* tag.`
  )
} else if (ref.value !== pin.tag) {
  console.error(
    `corral pin mismatch: canvas/corral.pin tag is ${pin.tag}, Cargo.toml corral-mcp tag is ${ref.value}`
  )
  process.exit(1)
} else {
  console.log(`corral pin matches Cargo.toml corral-mcp tag ${pin.tag}`)
}
