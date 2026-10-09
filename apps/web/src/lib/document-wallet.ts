import { BrowserProvider } from 'ethers';
import {
  selectedBlockchainNetwork,
  type BlockchainNetworkId,
} from '@/lib/blockchain-network';
import { activeMetaMaskConnection } from '@/lib/sepolia-marketplace';

export type WalletProviderLike = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: WalletProviderLike[];
};

export interface WalletSession {
  account: string;
  chainId: number;
  provider: WalletProviderLike;
  browserProvider: BrowserProvider;
}

export interface DocumentNetworkStatus {
  networkId: BlockchainNetworkId;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  contractAddress?: string;
  walletAddress?: string;
  serverSignerReady?: boolean;
  mode: 'LIVE' | 'SIMULATED';
  liveReady: boolean;
  message: string;
}

export const DOCUMENT_REGISTRY_ABI = [
  'function anchorDocumentVersion(string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)',
] as const;

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function normalizeHash(value?: string) {
  if (!value) {
    return `0x${'0'.repeat(64)}`;
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

export function readErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
      ? error.code
      : undefined;
  if (code === 4001) {
    return 'MetaMask request was cancelled.';
  }
  if (code === -32002) {
    return 'MetaMask already has a pending request open. Open the extension and finish that request first.';
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data
  ) {
    const message = error.response.data.message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function assertSelectedNetwork(network?: DocumentNetworkStatus) {
  if (!network) {
    throw new Error('The selected blockchain network could not be loaded. Try again before signing.');
  }
  const selected = selectedBlockchainNetwork();
  if (network.networkId !== selected.id || network.chainId !== selected.chainId) {
    throw new Error(
      `Network selection changed or is stale. CAPROV selected ${selected.chainName} (chain ID ${selected.chainId}), but the document anchor is configured for ${network.chainName} (chain ID ${network.chainId}). Refresh and try again.`,
    );
  }
}

export async function ensureDocumentNetwork(
  provider: WalletProviderLike,
  network?: DocumentNetworkStatus,
) {
  const selected = selectedBlockchainNetwork();
  const chainId = network?.chainId ?? selected.chainId;
  const targetHex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'number'
        ? error.code
        : undefined;
    if (code !== 4902) {
      throw error;
    }
    const explorerUrl = network?.explorerBase ?? selected.blockExplorerUrl;
    const blockExplorerUrls =
      explorerUrl && !isLoopbackUrl(explorerUrl) ? { blockExplorerUrls: [explorerUrl] } : {};
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: targetHex,
          chainName: network?.chainName ?? selected.chainName,
          rpcUrls: [network?.rpcUrl ?? selected.rpcUrl],
          nativeCurrency: {
            name: selected.chainName,
            symbol: selected.id === 'besu' ? 'BESU' : 'SEP',
            decimals: 18,
          },
          ...blockExplorerUrls,
        },
      ],
    });
  }

  const activeChain = await provider.request({ method: 'eth_chainId' });
  const activeChainId =
    typeof activeChain === 'string' ? Number.parseInt(activeChain, 16) : Number(activeChain);
  if (activeChainId !== chainId) {
    throw new Error(
      `Wallet remains on chain ID ${activeChainId}. ${network?.chainName ?? selected.chainName} (chain ID ${chainId}) is required before an anchor can be submitted.`,
    );
  }
}

export async function connectMetaMask(
  network?: DocumentNetworkStatus,
): Promise<WalletSession> {
  const { provider, address: account } = await activeMetaMaskConnection();
  if (!account) throw new Error('Connect MetaMask from the top-right menu before signing an anchor.');
  assertSelectedNetwork(network);
  await ensureDocumentNetwork(provider, network);
  const selected = selectedBlockchainNetwork();
  const browserProvider = new BrowserProvider(provider, network?.chainId ?? selected.chainId);
  const chain = await browserProvider.getNetwork();
  return {
    account,
    chainId: Number(chain.chainId),
    provider,
    browserProvider,
  };
}

function isLoopbackUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
