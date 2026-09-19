'use client';

import { connectMetaMaskWallet, selectMetaMaskAccount } from '@/lib/sepolia-marketplace';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type WalletContextValue = {
  address?: string;
  accounts: string[];
  busy: boolean;
  message?: string;
  connect: () => Promise<string | undefined>;
  selectAccount: (address: string) => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const connect = useCallback(async () => {
    setBusy(true);
    setMessage('Confirm the connection in MetaMask.');
    try {
      const connection = await connectMetaMaskWallet();
      setAddress(connection.address);
      setAccounts(connection.accounts);
      setMessage('Wallet connected on Ethereum Sepolia.');
      return connection.address;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'MetaMask connection could not be completed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const selectAccount = useCallback(async (nextAddress: string) => {
    const selected = await selectMetaMaskAccount(nextAddress);
    setAddress(selected);
    setMessage(`Active wallet changed to ${selected.slice(0, 6)}…${selected.slice(-4)}.`);
  }, []);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;
    const updateAccounts = (next: string[]) => {
      setAccounts(next);
      setAddress((current) => next.find((item) => item.toLowerCase() === current?.toLowerCase()) ?? next[0]);
    };
    void ethereum.request({ method: 'eth_accounts' }).then((result) => updateAccounts(result as string[])).catch(() => undefined);
    ethereum.on?.('accountsChanged', updateAccounts);
    ethereum.on?.('chainChanged', () => setMessage('Wallet network changed. Use Ethereum Sepolia for CAPROV transactions.'));
    return () => {
      ethereum.removeListener?.('accountsChanged', updateAccounts);
      ethereum.removeListener?.('chainChanged', () => undefined);
    };
  }, []);

  const value = useMemo(() => ({ address, accounts, busy, message, connect, selectAccount }), [address, accounts, busy, message, connect, selectAccount]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider.');
  return context;
}
