'use client';

import {
  alignMetaMaskToSelectedNetwork,
  activeMetaMaskProvider,
  chooseMetaMaskAccount,
  clearMetaMaskConnection,
  connectMetaMaskWallet,
  selectMetaMaskAccount,
} from '@/lib/sepolia-marketplace';
import { blockchainNetworkForChainId, selectedBlockchainNetwork, setSelectedBlockchainNetwork, type BlockchainNetworkId, type BrowserNetwork } from '@/lib/blockchain-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type InjectedProvider = {
  request: (input: { method: string }) => Promise<unknown>;
  on?: (event: string, listener: (value: string | string[]) => void) => void;
  removeListener?: (event: string, listener: (value: string | string[]) => void) => void;
};

type WalletContextValue = {
  address?: string;
  accounts: string[];
  busy: boolean;
  message?: string;
  networkId: BlockchainNetworkId;
  network: BrowserNetwork;
  selectNetwork: (networkId: BlockchainNetworkId) => Promise<void>;
  syncNetwork: () => Promise<void>;
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
      setMessage(`Checking MetaMask is on ${network.chainName}…`);
      try {
        await alignMetaMaskToSelectedNetwork();
        setMessage(`MetaMask is on ${network.chainName} (chain ID ${network.chainId}).`);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : `Selected ${network.chainName}. Open MetaMask and switch to that network, then try again.`,
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    setMessage(`Selected ${network.chainName}. Connect MetaMask when you are ready to sign.`);
    setBusy(false);
  }, [address]);

  const syncNetwork = useCallback(async () => {
    setBusy(true);
    try {
      const provider = await activeMetaMaskProvider();
      const value = await provider.request({ method: 'eth_chainId' });
      const chainId = typeof value === 'string' ? Number.parseInt(value, 16) : Number.NaN;
      const network = Number.isSafeInteger(chainId) ? blockchainNetworkForChainId(chainId) : undefined;
      if (!network) {
        setMessage('MetaMask is on an unsupported network. Select Ethereum Sepolia or CAPROV Besu in MetaMask, then check again.');
        return;
      }
      setSelectedBlockchainNetwork(network.id);
      setNetworkId(network.id);
      setMessage(`Verified: MetaMask is on ${network.chainName} (chain ID ${network.chainId}).`);
    } catch (error) {
      setMessage(error instanceof Error ? `Could not read MetaMask’s active network: ${error.message}` : 'Could not read MetaMask’s active network. Unlock MetaMask and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

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
      try {
        await alignMetaMaskToSelectedNetwork();
        setMessage(`Active wallet changed to ${connection.address.slice(0, 6)}…${connection.address.slice(-4)} on ${selectedBlockchainNetwork().chainName}.`);
      } catch (error) {
        setMessage(
          `${connection.address.slice(0, 6)}…${connection.address.slice(-4)} selected. ${error instanceof Error ? error.message : 'Select the CAPROV network in MetaMask before signing.'}`,
        );
      }
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
    let provider: InjectedProvider | undefined;
    let disposed = false;
    const updateAccounts = (value: string | string[]) => {
      const next = Array.isArray(value) ? value : [];
      setAccounts(next);
      setAddress((current) => next.find((item) => item.toLowerCase() === current?.toLowerCase()) ?? next[0]);
    };
    // Do not probe an injected provider during page load. Some browser wallet
    // extensions reject even `eth_accounts` until explicitly selected by the
    // user, and an extension-level rejection can otherwise trigger Next's
    // development error overlay. Account access begins from the Connect button.
    const updateChain = (value: string | string[]) => {
      const chainId = typeof value === 'string' ? value : '';
      const parsedChainId = Number.parseInt(chainId, 16);
      const network = Number.isSafeInteger(parsedChainId) ? blockchainNetworkForChainId(parsedChainId) : undefined;
      if (network) {
        setSelectedBlockchainNetwork(network.id);
        setNetworkId(network.id);
        setMessage(`MetaMask switched to ${network.chainName} (chain ID ${network.chainId}).`);
        return;
      }
      setMessage('MetaMask switched to an unsupported network. Select CAPROV Besu or Ethereum Sepolia to continue.');
    };
    const handleDisconnect = () => {
      clearMetaMaskConnection();
      setAccounts([]);
      setAddress(undefined);
      setMessage('MetaMask disconnected or restarted. Unlock MetaMask, then reconnect it to CAPROV.');
    };
    // Subscribe to the exact EIP-6963 MetaMask provider selected by CAPROV,
    // rather than whichever wallet extension last assigned window.ethereum.
    // This matters when MetaMask and another injected wallet are installed.
    void activeMetaMaskProvider()
      .then((selected) => {
        if (disposed) return;
        provider = selected as unknown as InjectedProvider;
        provider.on?.('accountsChanged', updateAccounts);
        provider.on?.('chainChanged', updateChain);
        provider.on?.('disconnect', handleDisconnect);
      })
      .catch(() => {
        // No provider is available until MetaMask is installed/unlocked.
      });
    return () => {
      disposed = true;
      provider?.removeListener?.('accountsChanged', updateAccounts);
      provider?.removeListener?.('chainChanged', updateChain);
      provider?.removeListener?.('disconnect', handleDisconnect);
    };
  }, [address]);

  const network = selectedBlockchainNetwork();
  const value = useMemo(() => ({ address, accounts, busy, message, networkId, network, selectNetwork, syncNetwork, connect, chooseAccount, selectAccount }), [address, accounts, busy, message, networkId, network, selectNetwork, syncNetwork, connect, chooseAccount, selectAccount]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider.');
  return context;
}
