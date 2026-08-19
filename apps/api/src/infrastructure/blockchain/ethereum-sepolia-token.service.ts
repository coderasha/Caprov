import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Contract, JsonRpcProvider, Wallet, HDNodeWallet, id as ethId, getAddress } from 'ethers';

export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111;
export const ETHEREUM_SEPOLIA_NAME = 'Ethereum Sepolia';
export const ETHEREUM_SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const DEFAULT_ETHEREUM_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const CAPROV_TOKEN_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes data)',
  'function uri(uint256 id) view returns (string)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
] as const;

export interface TokenNetworkStatus {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  connected: boolean;
  liveMintReady: boolean;
  contractAddress?: string;
  walletAddress?: string;
  mode: 'LIVE' | 'SIMULATED';
  message: string;
}

export interface MintRequest {
  assetId: string;
  tokenId: string;
  supply: number;
  recipientAddress?: string;
}

export interface MintResult {
  mode: 'LIVE' | 'SIMULATED';
  chainId: number;
  chainName: string;
  contractAddress?: string;
  tokenId: string;
  supply: number;
  recipientAddress: string;
  txHash: string;
  explorerUrl: string;
  status: 'CONFIRMED' | 'SIMULATED' | 'FAILED';
  error?: string;
}

export interface ProvenanceAnchorRequest {
  scopeId: string;
  hashValue: string;
}

export interface ProvenanceAnchorResult {
  mode: 'LIVE' | 'SIMULATED';
  chainId: number;
  chainName: string;
  txHash: string;
  explorerUrl: string;
  status: 'CONFIRMED' | 'SIMULATED' | 'FAILED';
  error?: string;
}

@Injectable()
export class EthereumSepoliaTokenService {
  private readonly logger = new Logger(EthereumSepoliaTokenService.name);

  getNetworkStatus(): TokenNetworkStatus {
    const rpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC;
    const privateKey = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.trim();
    const mnemonic = process.env.ETHEREUM_SEPOLIA_MNEMONIC?.trim();
    const contractAddress = process.env.ETHEREUM_TOKEN_CONTRACT?.trim();
    let walletAddress: string | undefined;
    if (privateKey || mnemonic) {
      try {
        walletAddress = this.buildWallet(rpcUrl).address;
      } catch {
        walletAddress = undefined;
      }
    }
    const liveMintReady = Boolean((privateKey || mnemonic) && contractAddress && walletAddress);
    return {
      chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
      chainName: ETHEREUM_SEPOLIA_NAME,
      rpcUrl,
      explorerBase: ETHEREUM_SEPOLIA_EXPLORER,
      connected: true,
      liveMintReady,
      contractAddress,
      walletAddress,
      mode: liveMintReady ? 'LIVE' : 'SIMULATED',
      message: liveMintReady
        ? 'Live minting enabled against Ethereum Sepolia with configured signer and CaprovAssetToken contract.'
        : 'Simulated Sepolia minting active. Set ETHEREUM_SEPOLIA_PRIVATE_KEY and ETHEREUM_TOKEN_CONTRACT for live testnet mints.',
    };
  }

  async probeRpc(): Promise<{ ok: boolean; chainId?: number; error?: string }> {
    const rpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC;
    try {
      const provider = new JsonRpcProvider(rpcUrl, ETHEREUM_SEPOLIA_CHAIN_ID);
      const network = await provider.getNetwork();
      return { ok: true, chainId: Number(network.chainId) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'rpc probe failed' };
    }
  }

  async mintAssetToken(request: MintRequest): Promise<MintResult> {
    const status = this.getNetworkStatus();
    const recipient =
      request.recipientAddress?.trim() ||
      status.walletAddress ||
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

    if (!status.liveMintReady) {
      const txHash = `0x${createHash('sha256')
        .update(`${request.assetId}:${request.tokenId}:${request.supply}:${Date.now()}`)
        .digest('hex')}`;
      const to = normalizeAddress(recipient);
      return {
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        tokenId: request.tokenId,
        supply: request.supply,
        recipientAddress: to,
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'SIMULATED',
      };
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const wallet = this.buildWallet(status.rpcUrl, provider);
      const contract = new Contract(status.contractAddress!, CAPROV_TOKEN_ABI, wallet);
      const to = getAddress(request.recipientAddress?.trim() || wallet.address);
      const tokenId = BigInt(ethId(request.tokenId).slice(0, 18));
      const mintFn = contract.getFunction('mint');
      const tx = await mintFn(to, tokenId, BigInt(request.supply), '0x');
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx.hash;
      this.logger.log(`Minted Caprov token on Sepolia tx=${txHash}`);
      return {
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        tokenId: tokenId.toString(),
        supply: request.supply,
        recipientAddress: to,
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'CONFIRMED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mint failed';
      this.logger.warn(`Live Sepolia mint failed, recording simulated mint: ${message}`);
      const txHash = `0x${createHash('sha256').update(`fallback:${message}:${request.assetId}:${Date.now()}`).digest('hex')}`;
      return {
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        tokenId: request.tokenId,
        supply: request.supply,
        recipientAddress: normalizeAddress(recipient),
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'SIMULATED',
        error: message,
      };
    }
  }

  async anchorProvenanceHash(request: ProvenanceAnchorRequest): Promise<ProvenanceAnchorResult> {
    const status = this.getNetworkStatus();
    if (!status.liveMintReady) {
      const txHash = `0x${createHash('sha256')
        .update(`anchor:${request.scopeId}:${request.hashValue}:${Date.now()}`)
        .digest('hex')}`;
      return {
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'SIMULATED',
      };
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const wallet = this.buildWallet(status.rpcUrl, provider);
      const tx = await wallet.sendTransaction({
        to: wallet.address,
        value: 0n,
        data: `0x${request.hashValue}`,
      });
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx.hash;
      this.logger.log(`Anchored provenance hash on Sepolia tx=${txHash}`);
      return {
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'CONFIRMED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'anchor failed';
      this.logger.warn(`Live provenance anchor failed, recording simulated anchor: ${message}`);
      const txHash = `0x${createHash('sha256')
        .update(`anchor-fallback:${request.scopeId}:${request.hashValue}:${Date.now()}:${message}`)
        .digest('hex')}`;
      return {
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        txHash,
        explorerUrl: `${status.explorerBase}/tx/${txHash}`,
        status: 'SIMULATED',
        error: message,
      };
    }
  }

  private buildWallet(rpcUrl: string, provider?: JsonRpcProvider): Wallet | HDNodeWallet {
    const mnemonic = process.env.ETHEREUM_SEPOLIA_MNEMONIC?.trim();
    if (mnemonic) {
      const wallet = HDNodeWallet.fromPhrase(mnemonic);
      return provider ? wallet.connect(provider) : wallet;
    }
    const privateKey = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.trim();
    if (!privateKey) {
      throw new Error(
        `Missing ETHEREUM_SEPOLIA_PRIVATE_KEY or ETHEREUM_SEPOLIA_MNEMONIC for ${rpcUrl}`,
      );
    }
    return new Wallet(privateKey, provider);
  }
}

function normalizeAddress(value: string): string {
  try {
    return getAddress(value);
  } catch {
    return '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
  }
}
