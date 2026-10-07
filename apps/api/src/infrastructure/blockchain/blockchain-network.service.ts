import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type BlockchainNetworkId = 'sepolia' | 'besu';
export interface BlockchainNetworkConfig {
  id: BlockchainNetworkId; chainId: number; chainName: string; rpcUrl: string;
  explorerBase?: string; zeroGas: boolean; tokenContract?: string; paymentTokenContract?: string;
  marketplaceContract?: string; collateralVaultContract?: string; documentRegistryContract?: string;
  privateKey?: string; mnemonic?: string;
}
const requestNetwork = new AsyncLocalStorage<BlockchainNetworkId>();

/** Carries the caller's selected network through the complete API request. */
@Injectable()
export class BlockchainNetworkMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const header = String(req.headers['x-caprov-network'] ?? '').toLowerCase();
    requestNetwork.run(header === 'besu' ? 'besu' : 'sepolia', next);
  }
}

@Injectable()
export class BlockchainNetworkService {
  selectedId(): BlockchainNetworkId { return requestNetwork.getStore() ?? defaultNetworkId(); }
  selected(): BlockchainNetworkConfig { return this.get(this.selectedId()); }
  get(id: BlockchainNetworkId): BlockchainNetworkConfig {
    if (id === 'besu') return {
      id, chainId: integerEnv('BESU_CHAIN_ID', 1337),
      chainName: process.env.BESU_CHAIN_NAME?.trim() || 'Hyperledger Besu',
      rpcUrl: process.env.BESU_RPC_URL?.trim() || 'http://127.0.0.1:8545',
      explorerBase: process.env.BESU_EXPLORER_URL?.trim() || undefined,
      zeroGas: envBoolean('BESU_ZERO_GAS', true),
      tokenContract: process.env.BESU_ASSET_TOKEN_CONTRACT?.trim(), paymentTokenContract: process.env.BESU_PAYMENT_TOKEN_CONTRACT?.trim(),
      marketplaceContract: process.env.BESU_MARKETPLACE_CONTRACT?.trim(), collateralVaultContract: process.env.BESU_COLLATERAL_VAULT_CONTRACT?.trim(),
      documentRegistryContract: process.env.BESU_DOCUMENT_REGISTRY_CONTRACT?.trim(), privateKey: process.env.BESU_PRIVATE_KEY?.trim(), mnemonic: process.env.BESU_MNEMONIC?.trim(),
    };
    return {
      id, chainId: 11155111, chainName: 'Ethereum Sepolia', rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com', explorerBase: 'https://sepolia.etherscan.io', zeroGas: false,
      tokenContract: process.env.ETHEREUM_TOKEN_CONTRACT?.trim(), paymentTokenContract: process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT?.trim(), marketplaceContract: process.env.ETHEREUM_MARKETPLACE_CONTRACT?.trim(), collateralVaultContract: process.env.ETHEREUM_COLLATERAL_VAULT_CONTRACT?.trim(), documentRegistryContract: process.env.ETHEREUM_DOCUMENT_REGISTRY_CONTRACT?.trim(), privateKey: process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.trim(), mnemonic: process.env.ETHEREUM_SEPOLIA_MNEMONIC?.trim(),
    };
  }
}
function defaultNetworkId(): BlockchainNetworkId { return process.env.BLOCKCHAIN_DEFAULT_NETWORK?.toLowerCase() === 'besu' ? 'besu' : 'sepolia'; }
function integerEnv(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isSafeInteger(value) && value > 0 ? value : fallback; }
function envBoolean(name: string, fallback: boolean) { const value = process.env[name]?.trim().toLowerCase(); return value === undefined ? fallback : !['false', '0', 'no'].includes(value); }
