import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { shortAddress, type WalletTxRequest, walletApi } from '@/lib/wallet-api'
import { useWalletStatus } from './use-wallet-status'

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * The user's wallet: connect or disconnect it, and see the transactions
 * agents proposed. Signing happens on the local page in the user's browser,
 * where their wallet extension is; Wrangl only keeps the address.
 */
export function WalletDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Wallet</DialogTitle>
          <DialogDescription>
            Connect MetaMask, Rabby or another browser wallet. Wrangl keeps only your address.
            Agents can propose transactions; nothing is sent until you confirm it in your wallet.
          </DialogDescription>
        </DialogHeader>
        {open ? <WalletBody /> : null}
      </DialogContent>
    </Dialog>
  )
}

function WalletBody(): React.JSX.Element {
  const { snapshot, error, setSnapshot } = useWalletStatus(1500)
  const [busy, setBusy] = useState(false)

  const openSigner = async (): Promise<void> => {
    setBusy(true)
    try {
      await walletApi.openSigner()
      toast.success('Opened the signing page in your browser')
    } catch (err) {
      toast.error(`Could not open the signing page: ${errorText(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    try {
      setSnapshot(await walletApi.disconnect())
    } catch (err) {
      toast.error(`Could not disconnect: ${errorText(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const reject = async (request: WalletTxRequest): Promise<void> => {
    try {
      setSnapshot(await walletApi.reject(request.id))
    } catch (err) {
      toast.error(`Could not reject: ${errorText(err)}`)
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!snapshot) return <p className="text-sm text-muted-foreground">Loading…</p>

  const { address, requests } = snapshot
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border p-3">
        {address ? (
          <>
            <p className="text-sm">
              Connected <span className="font-mono text-xs break-all">{address}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Robinhood Chain (chain id {snapshot.chainId}). Watch-only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={openSigner}>
                Open signing page
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={disconnect}>
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">No wallet connected.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your browser opens a local Wrangl page. Connect your wallet there.
            </p>
            <Button size="sm" className="mt-3" disabled={busy} onClick={openSigner}>
              Connect wallet
            </Button>
          </>
        )}
      </section>

      <section aria-labelledby="wallet-requests">
        <h3 id="wallet-requests" className="mb-2 text-xs font-medium text-muted-foreground">
          Waiting for your signature
        </h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to sign.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">{request.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {request.valueEth} ETH to{' '}
                  <span className="font-mono">{shortAddress(request.to)}</span>
                  {request.data !== '0x' ? ' · contract call' : ''}
                </p>
                {request.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="mt-2 border-l-2 border-destructive pl-2 text-xs text-destructive"
                  >
                    {warning}
                  </p>
                ))}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={openSigner}>
                    Review in browser
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void reject(request)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
