'use client';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { connectMetaMaskWallet, selectMetaMaskAccount } from '@/lib/sepolia-marketplace';
import { useState } from 'react';

export function WalletConnect({ onConnected }: { onConnected?: (address: string) => void }) {
  const [address, setAddress] = useState<string>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm">
      <div>
        <p className="font-medium">Self-custody wallet</p>
        <p className="text-xs text-[var(--muted)]">
          {address ? `Sepolia · ${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect the MetaMask wallet that holds your CAP tokens.'}
        </p>
      </div>
      <Button className="ml-auto" variant="secondary" onClick={async () => {
        setError(undefined);
        try {
          const connection = await connectMetaMaskWallet();
          setAddress(connection.address);
          setAccounts(connection.accounts);
          onConnected?.(connection.address);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect wallet.'); }
      }}>
        {address ? 'MetaMask connected' : 'Connect MetaMask'}
      </Button>
      {accounts.length > 1 ? (
        <label className="flex w-full items-center gap-2 text-xs text-[var(--muted)]">
          MetaMask account
          <Select
            className="max-w-md py-2 text-xs"
            value={address ?? ''}
            onChange={async (event) => {
              try {
                setError(undefined);
                const selected = await selectMetaMaskAccount(event.target.value);
                setAddress(selected);
                onConnected?.(selected);
              } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not select MetaMask account.'); }
            }}
          >
            {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
          </Select>
        </label>
      ) : null}
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
