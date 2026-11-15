import { invoke } from '@tauri-apps/api/core'
import { isTauriContext } from './tauri-runtime'

/** A transaction an agent proposed, waiting for the user's signature. */
export interface WalletTxRequest {
  id: string
  from: string
  to: string
  valueWeiHex: string
  valueEth: string
  data: string
  description: string
  warnings: string[]
  gasEstimate: string | null
  createdAtMs: number
}

/** The connected wallet (watch-only: an address, never a key). */
export interface WalletSnapshot {
  address: string | null
  chainId: number
  chainIdHex: string
  rpcUrl: string
  requests: WalletTxRequest[]
}

/** The wallet lives on the desktop host only. */
export const walletAvailable = (): boolean => isTauriContext()

export const walletApi = {
  status: (): Promise<WalletSnapshot> => invoke<WalletSnapshot>('wallet_status'),
  /** Opens the local signing page in the default browser. */
  openSigner: (): Promise<void> => invoke<void>('wallet_open_signer'),
  disconnect: (): Promise<WalletSnapshot> => invoke<WalletSnapshot>('wallet_disconnect'),
  reject: (id: string): Promise<WalletSnapshot> => invoke<WalletSnapshot>('wallet_reject', { id })
}

/** `0x1234…abcd`. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
