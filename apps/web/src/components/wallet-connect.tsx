'use client';

import { Button } from '@/components/ui/button';
import { connectSepoliaWallet } from '@/lib/sepolia-marketplace';
import { useState } from 'react';

export function WalletConnect({ onConnected }: { onConnected?: (address: string) => void }) {
  const [address, setAddress] = useState<string>();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm">
      <div>
        <p className="font-medium">Self-custody wallet</p>
        <p className="text-xs text-[var(--muted)]">
          {address ? `Sepolia · ${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect the wallet that holds your asset units or CAPROV.'}
        </p>
      </div>
      <Button className="ml-auto" variant="secondary" onClick={async () => {
        setError(undefined);
        try { const nextAddress = await connectSepoliaWallet(); setAddress(nextAddress); onConnected?.(nextAddress); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect wallet.'); }
      }}>
        {address ? 'Wallet connected' : 'Connect MetaMask'}
      </Button>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
