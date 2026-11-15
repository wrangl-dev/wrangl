import { useState } from 'react'
import { Wallet } from '@/components/icons'
import { RailRow } from '@/components/shell/RailRow'
import { RailButton } from '@/components/shell/rail-button'
import { shortAddress, walletAvailable } from '@/lib/wallet-api'
import { useWalletStatus } from './use-wallet-status'
import { WalletDialog } from './WalletDialog'

/** Agents can propose at any time; the Rail notices within a few seconds. */
const RAIL_POLL_MS = 4000

/**
 * The Rail's Wallet entry: a row in the expanded Rail, an icon in the
 * collapsed one. Shows how many proposals wait for a signature and opens the
 * Wallet dialog. Desktop only: the wallet lives on the desktop host.
 */
export function WalletRailEntry({
  variant
}: {
  variant: 'row' | 'icon'
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const { snapshot } = useWalletStatus(RAIL_POLL_MS)
  if (!walletAvailable()) return null

  const waiting = snapshot?.requests.length ?? 0
  const address = snapshot?.address ?? null
  const hint = waiting
    ? `${waiting} waiting for your signature`
    : address
      ? shortAddress(address)
      : 'Not connected'
  const name = waiting ? `Wallet, ${waiting} waiting for your signature` : 'Wallet'

  return (
    <>
      {variant === 'row' ? (
        <RailRow
          label="Wallet"
          name={name}
          hint={hint}
          chip={waiting ? String(waiting) : undefined}
          icon={<Wallet size={16} />}
          onClick={() => setOpen(true)}
        />
      ) : (
        <RailButton
          label="Wallet"
          hint={hint}
          aria-label={name}
          onClick={() => setOpen(true)}
          badge={
            waiting ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white"
              >
                {waiting}
              </span>
            ) : null
          }
        >
          <Wallet size={16} />
        </RailButton>
      )}
      <WalletDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
