export type BlockchainNetworkId = 'sepolia' | 'besu';
export type BrowserNetwork = {
  id: BlockchainNetworkId; chainId: number; chainName: string; rpcUrl: string;
  blockExplorerUrl?: string; zeroGas: boolean; assetToken?: string; paymentToken?: string;
  marketplace?: string; collateralVault?: string; documentRegistry?: string;
};

const networks: Record<BlockchainNetworkId, BrowserNetwork> = {
  sepolia: {
    id: 'sepolia', chainId: 11155111, chainName: 'Ethereum Sepolia', rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorerUrl: 'https://sepolia.etherscan.io', zeroGas: false,
    assetToken: process.env.NEXT_PUBLIC_ETHEREUM_ASSET_TOKEN_CONTRACT, paymentToken: process.env.NEXT_PUBLIC_ETHEREUM_PAYMENT_TOKEN_CONTRACT,
    marketplace: process.env.NEXT_PUBLIC_ETHEREUM_MARKETPLACE_CONTRACT, collateralVault: process.env.NEXT_PUBLIC_ETHEREUM_COLLATERAL_VAULT_CONTRACT,
    documentRegistry: process.env.NEXT_PUBLIC_ETHEREUM_DOCUMENT_REGISTRY_CONTRACT,
  },
  besu: {
    id: 'besu', chainId: Number(process.env.NEXT_PUBLIC_BESU_CHAIN_ID || 1337), chainName: process.env.NEXT_PUBLIC_BESU_CHAIN_NAME || 'Hyperledger Besu', rpcUrl: process.env.NEXT_PUBLIC_BESU_RPC_URL || 'http://127.0.0.1:8545',
    blockExplorerUrl: process.env.NEXT_PUBLIC_BESU_EXPLORER_URL, zeroGas: process.env.NEXT_PUBLIC_BESU_ZERO_GAS !== 'false',
    assetToken: process.env.NEXT_PUBLIC_BESU_ASSET_TOKEN_CONTRACT, paymentToken: process.env.NEXT_PUBLIC_BESU_PAYMENT_TOKEN_CONTRACT,
    marketplace: process.env.NEXT_PUBLIC_BESU_MARKETPLACE_CONTRACT, collateralVault: process.env.NEXT_PUBLIC_BESU_COLLATERAL_VAULT_CONTRACT,
    documentRegistry: process.env.NEXT_PUBLIC_BESU_DOCUMENT_REGISTRY_CONTRACT,
  },
};
const storageKey = 'caprov-blockchain-network';
export function selectedBlockchainNetwork(): BrowserNetwork {
  if (typeof window === 'undefined') return networks.sepolia;
  return networks[window.localStorage.getItem(storageKey) === 'besu' ? 'besu' : 'sepolia'];
}
export function setSelectedBlockchainNetwork(id: BlockchainNetworkId) {
  window.localStorage.setItem(storageKey, id);
  window.dispatchEvent(new Event('caprov-network-changed'));
}
export function blockchainNetworks() { return [networks.sepolia, networks.besu]; }

/** Returns the CAPROV network represented by an EIP-1193 chain id. */
export function blockchainNetworkForChainId(chainId: number) {
  return blockchainNetworks().find((network) => network.chainId === chainId);
}
