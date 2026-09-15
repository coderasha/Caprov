import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  HDNodeWallet,
  Interface,
  id as ethId,
  getAddress,
  isAddress,
} from 'ethers';
import { sepoliaTxExplorerUrl } from './explorer';

export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111;
export const ETHEREUM_SEPOLIA_NAME = 'Ethereum Sepolia';
export const ETHEREUM_SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const DEFAULT_ETHEREUM_SEPOLIA_RPC =
  'https://ethereum-sepolia-rpc.publicnode.com';

const CAPROV_TOKEN_ABI = [
  'function mintAsset(address to, uint256 id, uint256 amount, string assetReference)',
  'function uri(uint256 id) view returns (string)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event AssetCreated(uint256 indexed id, uint256 supply, string assetReference)',
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
  mode: 'LIVE' | 'UNAVAILABLE';
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
  txHash?: string;
  explorerUrl?: string;
  status: 'CONFIRMED' | 'SIMULATED' | 'FAILED';
  error?: string;
}

export interface WalletMintVerification {
  txHash: string;
  assetId: string;
  supply: number;
  recipientAddress: string;
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
    const rpcUrl =
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() ||
      DEFAULT_ETHEREUM_SEPOLIA_RPC;
    const privateKey = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.trim();
    const mnemonic = process.env.ETHEREUM_SEPOLIA_MNEMONIC?.trim();
    const configuredContractAddress = process.env.ETHEREUM_TOKEN_CONTRACT?.trim();
    const contractAddress =
      configuredContractAddress && isAddress(configuredContractAddress)
        ? getAddress(configuredContractAddress)
        : undefined;
    let walletAddress: string | undefined;
    if (privateKey || mnemonic) {
      try {
        walletAddress = this.buildWallet(rpcUrl).address;
      } catch {
        walletAddress = undefined;
      }
    }
    const liveMintReady = Boolean(
      (privateKey || mnemonic) && contractAddress && walletAddress,
    );
    return {
      chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
      chainName: ETHEREUM_SEPOLIA_NAME,
      rpcUrl,
      explorerBase: ETHEREUM_SEPOLIA_EXPLORER,
      connected: true,
      liveMintReady,
      contractAddress,
      walletAddress,
      mode: liveMintReady ? 'LIVE' : 'UNAVAILABLE',
      message: liveMintReady
        ? 'Live minting enabled against Ethereum Sepolia with configured signer and CaprovAssetToken contract.'
        : contractAddress
          ? 'Wallet-signed Sepolia minting is available in Marketplace. Connect an authorized MetaMask account to mint; the API does not hold or require a private key for this flow.'
          : 'Ethereum Sepolia tokenization is unavailable because ETHEREUM_TOKEN_CONTRACT is not configured.',
    };
  }

  async probeRpc(): Promise<{ ok: boolean; chainId?: number; error?: string }> {
    const rpcUrl =
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() ||
      DEFAULT_ETHEREUM_SEPOLIA_RPC;
    try {
      const provider = new JsonRpcProvider(rpcUrl, ETHEREUM_SEPOLIA_CHAIN_ID);
      const network = await provider.getNetwork();
      return { ok: true, chainId: Number(network.chainId) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'rpc probe failed',
      };
    }
  }

  /** The ERC-1155 type is deterministic for an asset, regardless of who signs the mint. */
  tokenIdForAsset(assetId: string): string {
    return BigInt(ethId(`caprov:asset:${assetId}`)).toString();
  }

  /**
   * Verifies a mint signed in the user's browser wallet before it is recorded
   * by the API. This deliberately needs only an RPC URL and token contract,
   * never an API-held private key.
   */
  async verifyWalletMintTransaction(input: WalletMintVerification): Promise<boolean> {
    const status = this.getNetworkStatus();
    if (!status.contractAddress || !isAddress(input.recipientAddress) || input.supply < 1) return false;
    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const receipt = await provider.getTransactionReceipt(input.txHash);
      if (!receipt || receipt.status !== 1) return false;
      const iface = new Interface(CAPROV_TOKEN_ABI);
      const expectedTokenId = this.tokenIdForAsset(input.assetId);
      const recipient = getAddress(input.recipientAddress);
      let assetCreated = false;
      let mintedToRecipient = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== status.contractAddress.toLowerCase()) continue;
        try {
          const event = iface.parseLog(log);
          if (event?.name === 'AssetCreated') {
            assetCreated =
              event.args.id.toString() === expectedTokenId &&
              event.args.supply.toString() === String(input.supply) &&
              event.args.assetReference === input.assetId;
          }
          if (event?.name === 'TransferSingle') {
            mintedToRecipient =
              event.args.from === '0x0000000000000000000000000000000000000000' &&
              getAddress(event.args.to) === recipient &&
              event.args.id.toString() === expectedTokenId &&
              event.args.value.toString() === String(input.supply);
          }
        } catch {
          // An unrelated log from the transaction is not evidence of a mint.
        }
      }
      return assetCreated && mintedToRecipient;
    } catch (error) {
      this.logger.warn(`Could not verify browser-wallet mint ${input.txHash}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async mintAssetToken(request: MintRequest): Promise<MintResult> {
    const status = this.getNetworkStatus();
    const recipient =
      request.recipientAddress?.trim() ||
      status.walletAddress ||
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

    if (!status.liveMintReady) {
      return {
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        tokenId: request.tokenId,
        supply: request.supply,
        recipientAddress: normalizeAddress(recipient),
        status: 'FAILED',
        error:
          'Live Ethereum Sepolia minting is not configured. Set ETHEREUM_SEPOLIA_PRIVATE_KEY (or ETHEREUM_SEPOLIA_MNEMONIC) and ETHEREUM_TOKEN_CONTRACT.',
      };
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const wallet = this.buildWallet(status.rpcUrl, provider);
      const contract = new Contract(
        status.contractAddress!,
        CAPROV_TOKEN_ABI,
        wallet,
      );
      const to = getAddress(request.recipientAddress?.trim() || wallet.address);
      // The asset id—not the listing id—defines the ERC-1155 token type. This
      // makes every asset's supply immutable after its first tokenization.
      const tokenId = BigInt(this.tokenIdForAsset(request.assetId));
      const mintFn = contract.getFunction('mintAsset');
      const tx = await mintFn(to, tokenId, BigInt(request.supply), request.assetId);
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
        explorerUrl: sepoliaTxExplorerUrl(txHash) ?? `${status.explorerBase}/tx/${txHash}`,
        status: 'CONFIRMED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mint failed';
      this.logger.warn(`Live Sepolia mint failed; no simulated mint was created: ${message}`);
      return {
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        tokenId: request.tokenId,
        supply: request.supply,
        recipientAddress: normalizeAddress(recipient),
        status: 'FAILED',
        error: message,
      };
    }
  }

  async anchorProvenanceHash(
    request: ProvenanceAnchorRequest,
  ): Promise<ProvenanceAnchorResult> {
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
        explorerUrl: sepoliaTxExplorerUrl(txHash) ?? `${status.explorerBase}/tx/${txHash}`,
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
        explorerUrl: sepoliaTxExplorerUrl(txHash) ?? `${status.explorerBase}/tx/${txHash}`,
        status: 'CONFIRMED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'anchor failed';
      this.logger.warn(
        `Live provenance anchor failed, recording simulated anchor: ${message}`,
      );
      const txHash = `0x${createHash('sha256')
        .update(
          `anchor-fallback:${request.scopeId}:${request.hashValue}:${Date.now()}:${message}`,
        )
        .digest('hex')}`;
      return {
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        txHash,
        explorerUrl: sepoliaTxExplorerUrl(txHash) ?? `${status.explorerBase}/tx/${txHash}`,
        status: 'SIMULATED',
        error: message,
      };
    }
  }

  private buildWallet(
    rpcUrl: string,
    provider?: JsonRpcProvider,
  ): Wallet | HDNodeWallet {
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
