export interface CorralPin {
  tag: string
  url: string
  sha256: string
}

export type CorralMcpRef = { kind: 'tag' | 'rev' | 'path'; value: string }

export function parsePin(text: string): CorralPin
export function readPin(path: string): CorralPin
export function cargoCorralMcpRef(cargoToml: string): CorralMcpRef | null
