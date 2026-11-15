import { useCallback, useEffect, useState } from 'react'
import { type WalletSnapshot, walletApi, walletAvailable } from '@/lib/wallet-api'

/**
 * The wallet snapshot, read again every `pollMs` while mounted. Proposals
 * arrive from agents at any time, so the Rail polls slowly and the open
 * dialog quickly.
 */
export function useWalletStatus(pollMs: number): {
  snapshot: WalletSnapshot | null
  error: string | null
  setSnapshot: (snapshot: WalletSnapshot) => void
  reload: () => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!walletAvailable()) return
    try {
      setSnapshot(await walletApi.status())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (!walletAvailable()) return
    void reload()
    const timer = window.setInterval(() => void reload(), pollMs)
    return () => window.clearInterval(timer)
  }, [pollMs, reload])

  return { snapshot, error, setSnapshot, reload }
}
