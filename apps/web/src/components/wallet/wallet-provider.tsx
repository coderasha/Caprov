'use client';

import {
  activeMetaMaskProvider,
  clearMetaMaskConnection,
  connectMetaMaskWallet,
  activeMetaMaskConnection,
  alignMetaMaskToNetwork,
  promptMetaMaskAccountSelection,
  selectMetaMaskAccount,
  syncActiveMetaMaskAccount,
  walletBrowserProvider,
} from '@/lib/sepolia-marketplace';
import { blockchainNetworkForChainId, blockchainNetworks, selectedBlockchainNetwork, setSelectedBlockchainNetwork, type BlockchainNetworkId, type BrowserNetwork } from '@/lib/blockchain-network';
import { api } from '@/lib/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type InjectedProvider = {
  request: (input: { method: string }) => Promise<unknown>;
  on?: (event: string, listener: (value: string | string[]) => void) => void;
  removeListener?: (event: string, listener: (value: string | string[]) => void) => void;
};

type WalletContextValue = {
  address?: string;
  accounts: string[];
  selectedAccount?: string;
  busy: boolean;
  message?: string;
  networkId: BlockchainNetworkId;
  network: BrowserNetwork;
  selectNetwork: (networkId: BlockchainNetworkId) => Promise<void>;
  syncNetwork: () => Promise<void>;
  connect: () => Promise<string | undefined>;
  switchAccount: () => Promise<string | undefined>;
  selectAccount: (address: string) => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [networkId, setNetworkId] = useState<BlockchainNetworkId>('sepolia');
  const requestedNetworkRef = useRef<BlockchainNetworkId | undefined>(undefined);
  useEffect(() => {
    setNetworkId(selectedBlockchainNetwork().id);
  }, []);

  const selectNetwork = useCallback(async (next: BlockchainNetworkId) => {
    if (requestedNetworkRef.current) {
      setMessage('A MetaMask network switch is already in progress. Complete that request before choosing another network.');
      return;
    }
    const previousNetwork = selectedBlockchainNetwork();
    if (previousNetwork.id === next) {
      setMessage(`MetaMask is already set to ${previousNetwork.chainName}.`);
      return;
    }
    const targetNetwork = blockchainNetworks().find((network) => network.id === next)!;
    setBusy(true);
    // Prefer a chain switch only — avoid eth_requestAccounts on every toggle so
    // MetaMask does not open a second connect popup while switching networks.
    if (address) {
      setMessage(`Switching MetaMask to ${targetNetwork.chainName}…`);
      try {
        // Keep CAPROV on its current network until MetaMask confirms the
        // explicit target. This avoids issuing a second/stale switch while
        // MetaMask is emitting its intermediate chainChanged event.
        requestedNetworkRef.current = next;
        await alignMetaMaskToNetwork(targetNetwork);
        setSelectedBlockchainNetwork(next);
        setNetworkId(next);
        setMessage(`Connected on ${targetNetwork.chainName} (chain ID ${targetNetwork.chainId}).`);
      } catch (error) {
        setSelectedBlockchainNetwork(previousNetwork.id);
        setNetworkId(previousNetwork.id);
        setMessage(
          error instanceof Error
            ? error.message
            : `Could not switch to ${targetNetwork.chainName}. Open MetaMask and switch networks, then try again.`,
        );
      } finally {
        requestedNetworkRef.current = undefined;
        setBusy(false);
      }
      return;
    }

    setSelectedBlockchainNetwork(next);
    setNetworkId(next);
    setMessage(`Selected ${targetNetwork.chainName}. Connect MetaMask to use this network.`);
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
        setMessage(
          'MetaMask is on an unsupported network. Choose Ethereum Sepolia or CAPROV Besu Local in CAPROV (or MetaMask), then try again.',
        );
        return;
      }
      setSelectedBlockchainNetwork(network.id);
      setNetworkId(network.id);
      setMessage(`Verified: MetaMask is on ${network.chainName} (chain ID ${network.chainId}).`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not read MetaMask’s active network: ${error.message}`
          : 'Could not read MetaMask’s active network. Unlock MetaMask and try again.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    const selected = selectedBlockchainNetwork();
    setMessage(`Connecting MetaMask on ${selected.chainName}…`);
    try {
      const connection = await connectMetaMaskWallet();
      const chainId = selectedBlockchainNetwork().chainId;
      setMessage('Confirm the signature to verify this wallet for your CAPROV account…');
      const challenge = (await api.post<{ challengeId: string; message: string }>('/auth/wallets/challenge', {
        address: connection.address,
        chainId,
      })).data;
      const active = await activeMetaMaskConnection();
      const signature = await (await walletBrowserProvider(active.provider, chainId).getSigner(connection.address)).signMessage(challenge.message);
      await api.post('/auth/wallets/verify', { challengeId: challenge.challengeId, signature });
      setAddress(connection.address);
      setAccounts(connection.accounts);
      setSelectedAccount(connection.address);
      setNetworkId(selectedBlockchainNetwork().id);
      setMessage(
        `Wallet verified for this CAPROV account on ${selectedBlockchainNetwork().chainName} (${connection.address.slice(0, 6)}…${connection.address.slice(-4)}).`,
      );
      return connection.address;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'MetaMask connection could not be completed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const switchAccount = useCallback(async () => {
    if (requestedNetworkRef.current) {
      setMessage('A MetaMask request is already in progress. Complete it before changing accounts.');
      return undefined;
    }
    setBusy(true);
    setMessage('Choose an account in MetaMask…');
    try {
      const selection = await promptMetaMaskAccountSelection();
      setAccounts(selection.accounts);
      setSelectedAccount(selection.address);
      // Selection is intentionally not treated as a CAPROV wallet connection.
      // The selected address must complete the signed verification step first.
      setAddress(undefined);
      setMessage('Account selected. Verify it to use it with CAPROV.');
      return selection.address;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'MetaMask account selection could not be completed.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const selectAccount = useCallback(async (nextAddress: string) => {
    setBusy(true);
    try {
      const selected = await selectMetaMaskAccount(nextAddress);
      // Choosing an exposed account is not proof that this CAPROV user controls
      // it. Keep the former verified address disconnected until the selected
      // account completes CAPROV's signature challenge.
      setSelectedAccount(selected);
      setAddress(undefined);
      setMessage(`Selected ${selected.slice(0, 6)}…${selected.slice(-4)}. Verify the selected account to use it with CAPROV.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not select that MetaMask account.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let provider: InjectedProvider | undefined;
    let disposed = false;
    const updateAccounts = (value: string | string[]) => {
      const next = Array.isArray(value) ? value : [];
      // MetaMask emits the selected account first. Mirror it into the shared
      // signer state so a switch in the extension affects the next signature.
      syncActiveMetaMaskAccount(next);
      setAccounts(next);
      setSelectedAccount(next[0]);
      setAddress((current) => {
        // MetaMask puts its newly active account first. Treat a change in that
        // account as disconnected until the user explicitly re-verifies it.
        if (current && next[0]?.toLowerCase() === current.toLowerCase()) return current;
        return undefined;
      });
      if (next.length) setMessage('MetaMask account changed. Connect wallet to verify the selected account for CAPROV.');
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
        // The in-flight switch is already awaiting this exact confirmation.
        // Let its caller commit the application network once, rather than
        // racing it with this event handler.
        if (requestedNetworkRef.current === network.id) return;
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
      setSelectedAccount(undefined);
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
  const value = useMemo(() => ({ address, accounts, selectedAccount, busy, message, networkId, network, selectNetwork, syncNetwork, connect, switchAccount, selectAccount }), [address, accounts, selectedAccount, busy, message, networkId, network, selectNetwork, syncNetwork, connect, switchAccount, selectAccount]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider.');
  return context;
}
