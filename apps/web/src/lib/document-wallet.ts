import { BrowserProvider, Contract, solidityPackedKeccak256 } from 'ethers';
import {
  selectedBlockchainNetwork,
  type BlockchainNetworkId,
} from '@/lib/blockchain-network';
import { activeMetaMaskConnection, ensureProviderChain, walletBrowserProvider } from '@/lib/sepolia-marketplace';

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
  'function latestVersionByLineage(bytes32 lineageKey) view returns (uint256)',
  'function getDocumentVersion(bytes32 lineageKey, uint256 version) view returns (string assetId, string documentId, string documentType, string documentName, uint256 storedVersion, bytes32 documentHash, uint256 anchoredAt, bytes32 previousVersionHash, string offChainUri, bool exists)',
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

/** Prevents an avoidable MetaMask RPC error when this chain already has a different document lineage. */
export async function assertNextDocumentAnchorVersion(
  contract: Contract,
  document: { assetId: string; id: string; type: string; name: string; version?: number; documentHash: string },
) {
  const requestedVersion = BigInt(document.version ?? 1);
  const lineageKey = solidityPackedKeccak256(
    ['string', 'string', 'string', 'string', 'string'],
    [document.assetId, '|', document.type, '|', document.name],
  );
  const latestVersion = BigInt(await contract.getFunction('latestVersionByLineage')(lineageKey));
  if (requestedVersion === latestVersion + 1n) return requestedVersion;

  let detail = `This network expects version ${latestVersion + 1n}, but this document is version ${requestedVersion}.`;
  if (requestedVersion <= latestVersion) {
    const existing = await contract.getFunction('getDocumentVersion')(lineageKey, requestedVersion);
    if (
      (existing[1] as string) === document.id &&
      (existing[5] as string).toLowerCase() === normalizeHash(document.documentHash).toLowerCase()
    ) {
      detail = 'This exact document version is already anchored on this network. Refresh the page; do not submit it again.';
    }
  }
  throw new Error(`${detail} Create the next document version before anchoring, or use a fresh document-registry deployment for a clean test network.`);
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
  await ensureProviderChain(provider, {
    ...selected,
    chainId,
    chainName: network?.chainName ?? selected.chainName,
    rpcUrl: network?.rpcUrl || selected.rpcUrl,
    // Never forward a loopback explorer. MetaMask crashes while resolving its origin.
    blockExplorerUrl: publicHttpsExplorer(network?.explorerBase) ?? publicHttpsExplorer(selected.blockExplorerUrl),
  });

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
  const browserProvider = walletBrowserProvider(provider, network?.chainId ?? selected.chainId);
  const chain = await browserProvider.getNetwork();
  return {
    account,
    chainId: Number(chain.chainId),
    provider,
    browserProvider,
  };
}

function publicHttpsExplorer(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    return url.protocol === 'https:' && !loopback ? value : undefined;
  } catch {
    return undefined;
  }
}
