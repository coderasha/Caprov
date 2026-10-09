'use client';

import {
  alignMetaMaskToSelectedNetwork,
  chooseMetaMaskAccount,
  connectMetaMaskWallet,
  selectMetaMaskAccount,
} from '@/lib/sepolia-marketplace';
import { selectedBlockchainNetwork, setSelectedBlockchainNetwork, type BlockchainNetworkId, type BrowserNetwork } from '@/lib/blockchain-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type InjectedProvider = {
  request: (input: { method: string }) => Promise<unknown>;
  on?: (event: string, listener: (value: string[]) => void) => void;
  removeListener?: (event: string, listener: (value: string[]) => void) => void;
};

type WalletContextValue = {
  address?: string;
  accounts: string[];
  busy: boolean;
  message?: string;
  networkId: BlockchainNetworkId;
  network: BrowserNetwork;
  selectNetwork: (networkId: BlockchainNetworkId) => Promise<void>;
  connect: () => Promise<string | undefined>;
  chooseAccount: () => Promise<string | undefined>;
  selectAccount: (address: string) => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [networkId, setNetworkId] = useState<BlockchainNetworkId>('sepolia');
  useEffect(() => { setNetworkId(selectedBlockchainNetwork().id); }, []);
  const selectNetwork = useCallback(async (next: BlockchainNetworkId) => {
    setSelectedBlockchainNetwork(next);
    setNetworkId(next);
    const network = selectedBlockchainNetwork();
    setBusy(true);
    // If MetaMask is already connected, only align the chain. Forcing a full
    // eth_requestAccounts on every network change can crash MetaMask's popup
    // while it resolves the page origin ("Cannot read properties of undefined
    // (reading 'origin')").
    if (address) {
      setMessage(`Switching MetaMask to ${network.chainName}…`);
      try {
        await alignMetaMaskToSelectedNetwork();
        setMessage(`MetaMask is on ${network.chainName} (chain ID ${network.chainId}).`);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Selected ${network.chainName}, but MetaMask did not switch: ${error.message}`
            : `Selected ${network.chainName}. Open MetaMask and switch network manually, then reconnect.`,
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    setMessage(`Selected ${network.chainName}. Connect MetaMask when you are ready to sign.`);
    setBusy(false);
  }, [address]);

  const connect = useCallback(async () => {
    setBusy(true);
    setMessage('Confirm the connection in MetaMask.');
    try {
      const connection = await connectMetaMaskWallet();
      setAddress(connection.address);
      setAccounts(connection.accounts);
      setMessage(`Wallet connected for ${selectedBlockchainNetwork().chainName}.`);
      return connection.address;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'MetaMask connection could not be completed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const chooseAccount = useCallback(async () => {
    setBusy(true);
    setMessage('Choose the MetaMask account to use for CAPROV.');
    try {
      const connection = await chooseMetaMaskAccount();
      setAddress(connection.address);
      setAccounts(connection.accounts);
      setMessage(`Active wallet changed to ${connection.address.slice(0, 6)}…${connection.address.slice(-4)}.`);
      return connection.address;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'MetaMask account selection could not be completed.');
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
    const ethereum = (window as Window & { ethereum?: InjectedProvider }).ethereum;
    if (!ethereum) return;
    const updateAccounts = (next: string[]) => {
      setAccounts(next);
      setAddress((current) => next.find((item) => item.toLowerCase() === current?.toLowerCase()) ?? next[0]);
    };
    // Do not probe an injected provider during page load. Some browser wallet
    // extensions reject even `eth_accounts` until explicitly selected by the
    // user, and an extension-level rejection can otherwise trigger Next's
    // development error overlay. Account access begins from the Connect button.
    ethereum.on?.('accountsChanged', updateAccounts);
    ethereum.on?.('chainChanged', () => setMessage(`Wallet network changed. Use ${selectedBlockchainNetwork().chainName} for CAPROV transactions.`));
    return () => {
      ethereum.removeListener?.('accountsChanged', updateAccounts);
      ethereum.removeListener?.('chainChanged', () => undefined);
    };
  }, []);

  const network = selectedBlockchainNetwork();
  const value = useMemo(() => ({ address, accounts, busy, message, networkId, network, selectNetwork, connect, chooseAccount, selectAccount }), [address, accounts, busy, message, networkId, network, selectNetwork, connect, chooseAccount, selectAccount]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider.');
  return context;
}
