'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { api } from '@/lib/api';
import { blockchainNetworks } from '@/lib/blockchain-network';
import { ChevronDown, ShieldCheck, WalletCards, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function networkLabel(id: string) {
  return id === 'sepolia' ? 'Ethereum Sepolia' : 'CAPROV Besu Local';
}

type VerifiedWallet = {
  address: string;
  chainId: number;
  verifiedAt: string;
  lastUsedAt: string;
};

export function WalletStatus() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    address,
    selectedAccount,
    selectedAccountNetworkId,
    busy,
    message,
    networkId,
    selectNetwork,
    connect,
    disconnect,
    switchAccount,
  } = useWallet();
  const network = blockchainNetworks().find((item) => item.id === networkId)!;
  const verifiedWallets = useQuery({
    queryKey: ['wallet-links'],
    enabled: open,
    queryFn: async () => (await api.get<VerifiedWallet[]>('/auth/wallets')).data,
  });
  const verifiedWalletFor = (chainId: number) =>
    (verifiedWallets.data ?? [])
      .filter((wallet) => wallet.chainId === chainId)
      .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))[0];

  const refreshVerifiedWallets = async () => {
    await verifiedWallets.refetch();
  };

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
        <ChevronDown
          size={14}
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_20px_50px_rgba(10,15,26,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Wallet access</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Connect MetaMask on Ethereum Sepolia or CAPROV Besu Local.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close wallet panel"
              className="rounded-lg p-1 text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)]/70 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--ink)]">
              <ShieldCheck size={15} className="text-[var(--teal)]" />
              Active network: {networkLabel(network.id)}
              {network.zeroGas ? ' · zero-fee' : ''}
            </div>
            <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
              Chain ID {network.chainId}
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)]/55 px-3 py-2.5">
            {(() => {
              const linkedWallet = verifiedWalletFor(network.chainId);
              // A historical link is useful after a reload, but must never
              // conceal the account the user has just selected in MetaMask.
              // Network-tagging the selection prevents a Sepolia address
              // appearing after the user changes the CAPROV network to Besu.
              const currentSelection =
                selectedAccountNetworkId === networkId ? selectedAccount ?? address : undefined;
              const waitingForVerification = Boolean(
                currentSelection && (!address || currentSelection.toLowerCase() !== address.toLowerCase()),
              );
              const displayedWallet = currentSelection ?? linkedWallet?.address;
              return (
                <>
                  <p className="text-[11px] font-medium text-[var(--muted)]">
                    {waitingForVerification ? 'Selected wallet for' : 'Verified wallet for'} {networkLabel(networkId)}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-[var(--ink)]" title={displayedWallet}>
                    {displayedWallet ?? 'No wallet verified on this network'}
                  </p>
                  {waitingForVerification ? (
                    <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
                      Verify this selected account before signing transactions.
                    </p>
                  ) : null}
                </>
              );
            })()}
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
                  className={`min-h-10 rounded-xl border px-2 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                    networkId === item.id
                      ? 'border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)]'
                      : 'border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--ink)]/25'
                  }`}
                >
                  {networkLabel(item.id)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
              Selecting a network asks MetaMask to switch. Add CAPROV Besu Local in MetaMask once before using it.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void switchAccount().then(refreshVerifiedWallets)}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/25 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Opening MetaMask…' : 'Switch accounts'}
          </button>

          {message ? (
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{message}</p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (address) {
                disconnect();
                return;
              }
              void connect().then(refreshVerifiedWallets);
            }}
            disabled={busy}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-medium text-white transition hover:bg-[#152033] disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? 'Confirm in MetaMask…'
              : address
                ? 'Disconnect MetaMask'
                : selectedAccount
                  ? 'Verify selected account'
                  : `Connect on ${networkLabel(networkId)}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
