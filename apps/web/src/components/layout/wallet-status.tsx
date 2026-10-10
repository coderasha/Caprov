'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { ChevronDown, ShieldCheck, WalletCards, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { blockchainNetworks } from '@/lib/blockchain-network';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletStatus() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { address, accounts, busy, message, networkId, selectNetwork, syncNetwork, connect, chooseAccount, selectAccount } = useWallet();
  const network = blockchainNetworks().find((item) => item.id === networkId)!;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function changeAccount(nextAddress: string) {
    try {
      await selectAccount(nextAddress);
    } catch { /* The provider exposes connection errors in this same panel. */ }
  }

  return (
    <div ref={panelRef} className="relative">
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
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Choose the network used for CAPROV transactions.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet panel" className="rounded-lg p-1 text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]">
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)]/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]">
              <ShieldCheck size={15} className="text-[var(--teal)]" />
              {network.chainName}{network.zeroGas ? ' · zero-fee' : ''}
            </div>
            <p className="mt-1.5 font-mono text-xs text-[var(--muted)]">
              {address ?? 'No MetaMask account connected'}
            </p>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-[var(--muted)]">Blockchain network</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {blockchainNetworks().map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void selectNetwork(item.id)}
                  className={`min-h-10 rounded-xl border px-2 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60 ${networkId === item.id ? 'border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)]' : 'border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--ink)]/25'}`}
                >
                  {item.id === 'sepolia' ? 'Ethereum Sepolia' : 'CAPROV Besu'}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium text-[var(--muted)]">Network selector
            <select value={networkId} onChange={(event) => void selectNetwork(event.target.value as typeof networkId)} className="mt-1.5 min-h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--teal)]">
              {blockchainNetworks().map((item) => <option key={item.id} value={item.id}>{item.chainName}{item.zeroGas ? ' (zero-fee)' : ''}</option>)}
            </select>
          </label>

          {address ? (
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

          <button
            type="button"
            onClick={() => void chooseAccount()}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/25 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Confirm in MetaMask…' : address ? 'Choose another MetaMask account' : 'Choose MetaMask account'}
          </button>

          <button
            type="button"
            onClick={() => void syncNetwork()}
            disabled={busy}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/25 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Checking MetaMask…' : 'Check MetaMask network'}
          </button>

          {message ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white transition hover:bg-[#152033] disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Confirm in MetaMask…' : address ? 'Reconnect MetaMask' : 'Connect current MetaMask account'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
