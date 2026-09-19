'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { ChevronDown, ShieldCheck, WalletCards, X } from 'lucide-react';
import { useState } from 'react';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletStatus() {
  const [open, setOpen] = useState(false);
  const { address, accounts, busy, message, connect, selectAccount } = useWallet();
  async function changeAccount(nextAddress: string) {
    try {
      await selectAccount(nextAddress);
    } catch { /* The provider exposes connection errors in this same panel. */ }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--ink)] shadow-sm transition hover:border-[var(--ink)]/25 hover:bg-white"
      >
        <WalletCards size={16} className={address ? 'text-[var(--teal)]' : 'text-[var(--muted)]'} />
        <span className="hidden sm:inline">{address ? shortAddress(address) : 'Wallet'}</span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_20px_50px_rgba(10,15,26,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Wallet access</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use MetaMask to sign CAPROV’s Sepolia transactions.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet panel" className="rounded-lg p-1 text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]">
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)]/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]">
              <ShieldCheck size={15} className="text-[var(--teal)]" />
              Ethereum Sepolia
            </div>
            <p className="mt-1.5 font-mono text-xs text-[var(--muted)]">
              {address ?? 'No MetaMask account connected'}
            </p>
          </div>

          {accounts.length > 1 ? (
            <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
              Active MetaMask account
              <select
                value={address ?? ''}
                onChange={(event) => void changeAccount(event.target.value)}
                className="mt-1.5 min-h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 font-mono text-xs text-[var(--ink)] outline-none focus:border-[var(--teal)]"
              >
                {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
              </select>
            </label>
          ) : null}

          {message ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white transition hover:bg-[#152033] disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Confirm in MetaMask…' : address ? 'Reconnect MetaMask' : 'Connect MetaMask'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
