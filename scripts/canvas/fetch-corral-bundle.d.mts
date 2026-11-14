export interface ZipEntry {
  name: string
  isDir: boolean
  read: () => Buffer
}

export const STAMP: string

export function sha256Hex(bytes: Buffer | Uint8Array): string
export function verifyChecksum(bytes: Buffer | Uint8Array, expected: string): void
export function readZipEntries(zip: Buffer): ZipEntry[]
export function extractBundle(zip: Buffer, outDir: string): number
export function pinnedBundleUrl(url: string): string
export function bundleMatchesPin(outDir: string, sha256: string): boolean
