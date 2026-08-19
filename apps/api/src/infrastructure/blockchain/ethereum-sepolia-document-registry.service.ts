import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Contract, JsonRpcProvider, Wallet, HDNodeWallet, id as ethId } from 'ethers';
import type {
  AnchoredDocumentVersionRecord,
  BlockchainAdapter,
  BlockchainAdapterNetworkStatus,
  DocumentVersionAnchorRequest,
  DocumentVersionAnchorResult,
} from './blockchain.adapter';

export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111;
export const ETHEREUM_SEPOLIA_NAME = 'Ethereum Sepolia';
export const ETHEREUM_SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const DEFAULT_ETHEREUM_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const DOCUMENT_REGISTRY_ABI = [
  'function anchorDocumentVersion(string assetId, string documentId, string documentType, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)',
  'function getDocumentVersion(bytes32 lineageKey, uint256 version) view returns (string assetId, string documentId, string documentType, uint256 storedVersion, bytes32 documentHash, uint256 anchoredAt, bytes32 previousVersionHash, string offChainUri, bool exists)',
] as const;

@Injectable()
export class EthereumSepoliaDocumentRegistryService implements BlockchainAdapter {
  private readonly logger = new Logger(EthereumSepoliaDocumentRegistryService.name);

  getDocumentNetworkStatus(): BlockchainAdapterNetworkStatus {
    const rpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC;
    const privateKey = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY?.trim();
    const mnemonic = process.env.ETHEREUM_SEPOLIA_MNEMONIC?.trim();
    const contractAddress = process.env.ETHEREUM_DOCUMENT_REGISTRY_CONTRACT?.trim();
    let walletAddress: string | undefined;
    if (privateKey || mnemonic) {
      try {
        walletAddress = this.buildWallet(rpcUrl).address;
      } catch {
        walletAddress = undefined;
      }
    }
    const liveReady = Boolean((privateKey || mnemonic) && contractAddress && walletAddress);
    return {
      chainId: ETHEREUM_SEPOLIA_CHAIN_ID,
      chainName: ETHEREUM_SEPOLIA_NAME,
      rpcUrl,
      explorerBase: ETHEREUM_SEPOLIA_EXPLORER,
      contractAddress,
      walletAddress,
      mode: liveReady ? 'LIVE' : 'SIMULATED',
      liveReady,
      message: liveReady
        ? 'Live document anchoring enabled against Ethereum Sepolia.'
        : 'Simulated Sepolia document anchoring active. Set ETHEREUM_SEPOLIA_PRIVATE_KEY and ETHEREUM_DOCUMENT_REGISTRY_CONTRACT for live on-chain anchoring.',
    };
  }

  buildDocumentBlockchainReference(assetId: string, documentType: string): string {
    return ethId(`${assetId}|${documentType}`);
  }

  async anchorDocumentVersion(
    request: DocumentVersionAnchorRequest,
  ): Promise<DocumentVersionAnchorResult> {
    const status = this.getDocumentNetworkStatus();
    const blockchainReference = this.buildDocumentBlockchainReference(
      request.assetId,
      request.documentType,
    );

    if (!status.liveReady) {
      const transactionHash = `0x${createHash('sha256')
        .update(
          `sepolia-doc-anchor:${request.assetId}:${request.documentType}:${request.version}:${request.documentHash}:${Date.now()}`,
        )
        .digest('hex')}`;
      return {
        status: 'SIMULATED',
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        transactionHash,
        explorerUrl: `${status.explorerBase}/tx/${transactionHash}`,
        anchoredAt: request.timestamp,
        blockchainReference,
      };
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const wallet = this.buildWallet(status.rpcUrl, provider);
      const contract = new Contract(status.contractAddress!, DOCUMENT_REGISTRY_ABI, wallet);
      const anchorFn = contract.getFunction('anchorDocumentVersion');
      const tx = await anchorFn(
        request.assetId,
        request.documentId,
        request.documentType,
        BigInt(request.version),
        normalizeHash(request.documentHash),
        normalizeHash(request.previousVersionHash),
        request.offChainUri,
      );
      const receipt = await tx.wait();
      const transactionHash = receipt?.hash ?? tx.hash;
      this.logger.log(
        `Anchored document version on Sepolia tx=${transactionHash} asset=${request.assetId} type=${request.documentType} v=${request.version}`,
      );
      return {
        status: 'BLOCKCHAIN_ANCHORED',
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        transactionHash,
        explorerUrl: `${status.explorerBase}/tx/${transactionHash}`,
        anchoredAt: request.timestamp,
        blockchainReference,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'document anchor failed';
      this.logger.warn(`Live Sepolia document anchoring failed, recording simulated anchor: ${message}`);
      const transactionHash = `0x${createHash('sha256')
        .update(
          `sepolia-doc-anchor-fallback:${request.assetId}:${request.documentType}:${request.version}:${request.documentHash}:${message}:${Date.now()}`,
        )
        .digest('hex')}`;
      return {
        status: 'ANCHOR_FAILED',
        mode: 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        transactionHash,
        explorerUrl: `${status.explorerBase}/tx/${transactionHash}`,
        anchoredAt: request.timestamp,
        blockchainReference,
        error: message,
      };
    }
  }

  async getAnchoredDocumentVersion(
    blockchainReference: string,
    version: number,
  ): Promise<AnchoredDocumentVersionRecord | null> {
    const status = this.getDocumentNetworkStatus();
    if (!status.liveReady || !status.contractAddress) {
      return null;
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const contract = new Contract(status.contractAddress, DOCUMENT_REGISTRY_ABI, provider);
      const getVersionFn = contract.getFunction('getDocumentVersion');
      const record = (await getVersionFn(blockchainReference, BigInt(version))) as [
        string,
        string,
        string,
        bigint,
        string,
        bigint,
        string,
        string,
        boolean,
      ];
      if (!record[8]) {
        return null;
      }
      return {
        assetId: record[0],
        documentId: record[1],
        documentType: record[2],
        version: Number(record[3]),
        documentHash: normalizeReturnedHash(record[4]) ?? `0x${'0'.repeat(64)}`,
        anchoredAt: new Date(Number(record[5]) * 1000).toISOString(),
        previousVersionHash: normalizeReturnedHash(record[6]),
        offChainUri: record[7],
        blockchainReference,
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'on-chain lookup failed';
      this.logger.warn(`Sepolia document version lookup failed: ${message}`);
      return null;
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
      throw new Error(`Missing ETHEREUM_SEPOLIA_PRIVATE_KEY or ETHEREUM_SEPOLIA_MNEMONIC for ${rpcUrl}`);
    }
    return new Wallet(privateKey, provider);
  }
}

function normalizeHash(value?: string): string {
  if (!value) {
    return `0x${'0'.repeat(64)}`;
  }
  const hash = value.startsWith('0x') ? value : `0x${value}`;
  return hash.slice(0, 66).padEnd(66, '0');
}

function normalizeReturnedHash(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  if (/^0x0{64}$/i.test(normalized)) {
    return undefined;
  }
  return normalized.toLowerCase();
}
