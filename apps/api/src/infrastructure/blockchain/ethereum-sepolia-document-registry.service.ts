import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  HDNodeWallet,
  id as ethId,
} from 'ethers';
import { transactionExplorerUrl } from './explorer';
import { BlockchainNetworkService, type BlockchainNetworkConfig } from './blockchain-network.service';
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
export const DEFAULT_ETHEREUM_SEPOLIA_RPC =
  'https://ethereum-sepolia-rpc.publicnode.com';

const DOCUMENT_REGISTRY_ABI = [
  'function anchorDocumentVersion(string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)',
  'function getDocumentVersion(bytes32 lineageKey, uint256 version) view returns (string assetId, string documentId, string documentType, string documentName, uint256 storedVersion, bytes32 documentHash, uint256 anchoredAt, bytes32 previousVersionHash, string offChainUri, bool exists)',
  'event DocumentVersionAnchored(bytes32 indexed lineageKey, string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri, uint256 anchoredAt)',
] as const;

@Injectable()
export class EthereumSepoliaDocumentRegistryService implements BlockchainAdapter {
  private readonly logger = new Logger(
    EthereumSepoliaDocumentRegistryService.name,
  );
  constructor(private readonly networks: BlockchainNetworkService) {}

  getDocumentNetworkStatus(): BlockchainAdapterNetworkStatus {
    const config = this.networks.selected();
    const rpcUrl = config.rpcUrl;
    const privateKey = config.privateKey;
    const mnemonic = config.mnemonic;
    const contractAddress = config.documentRegistryContract;
    let walletAddress: string | undefined;
    if (privateKey || mnemonic) {
      try {
        walletAddress = this.buildWallet(config).address;
      } catch {
        walletAddress = undefined;
      }
    }
    const liveReady = Boolean(
      contractAddress,
    );
    const serverSignerReady = Boolean(
      (privateKey || mnemonic) && contractAddress && walletAddress,
    );
    return {
      chainId: config.chainId,
      chainName: config.chainName,
      rpcUrl,
      explorerBase: config.explorerBase ?? '',
      contractAddress,
      walletAddress,
      serverSignerReady,
      mode: liveReady ? 'LIVE' : 'SIMULATED',
      liveReady,
      message: liveReady
        ? serverSignerReady
          ? `Live document anchoring is enabled against ${config.chainName}.`
          : `Live wallet-signed document anchoring is ready on ${config.chainName}. Org admins can connect MetaMask and sign the anchor transaction in the browser.`
        : `Document anchoring is not ready. Configure the document registry contract for ${config.chainName}.`,
    };
  }

  buildDocumentBlockchainReference(
    assetId: string,
    documentType: string,
    documentName: string,
  ): string {
    return ethId(`${assetId}|${documentType}|${documentName.trim()}`);
  }

  async anchorDocumentVersion(
    request: DocumentVersionAnchorRequest,
  ): Promise<DocumentVersionAnchorResult> {
    const status = this.getDocumentNetworkStatus();
    const blockchainReference = this.buildDocumentBlockchainReference(
      request.assetId,
      request.documentType,
      request.documentName,
    );

    if (!status.serverSignerReady || !status.contractAddress) {
      return {
        status: 'ANCHOR_FAILED',
        mode: status.liveReady ? 'LIVE' : 'SIMULATED',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        anchoredAt: request.timestamp,
        blockchainReference,
        error: status.message,
      };
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const wallet = this.buildWallet(this.networks.selected(), provider);
      const contract = new Contract(
        status.contractAddress!,
        DOCUMENT_REGISTRY_ABI,
        wallet,
      );
      const anchorFn = contract.getFunction('anchorDocumentVersion');
      const tx = await anchorFn(
        request.assetId,
        request.documentId,
        request.documentType,
        request.documentName,
        BigInt(request.version),
        normalizeHash(request.documentHash),
        normalizeHash(request.previousVersionHash),
        request.offChainUri,
        ...(this.networks.selected().zeroGas ? [{ gasPrice: 0n }] : []),
      );
      const receipt = await tx.wait();
      const transactionHash = receipt?.hash ?? tx.hash;
      if (!receipt || receipt.status !== 1) {
        throw new Error(
          `Sepolia document anchor transaction was not confirmed successfully (${transactionHash})`,
        );
      }
      const anchoredRecord = await this.getAnchoredDocumentVersion(
        blockchainReference,
        request.version,
      );
      if (
        !anchoredRecord ||
        anchoredRecord.documentHash.toLowerCase() !==
          normalizeHash(request.documentHash).toLowerCase()
      ) {
        throw new Error(
          `Sepolia anchor verification failed after tx ${transactionHash}`,
        );
      }
      const anchoredAt = receipt.blockNumber
        ? await this.resolveBlockTimestamp(provider, receipt.blockNumber)
        : request.timestamp;
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
        explorerUrl: status.explorerBase ? `${status.explorerBase.replace(/\/$/, '')}/tx/${transactionHash}` : undefined,
        anchoredAt,
        blockchainReference,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'document anchor failed';
      this.logger.warn(
        `Live Sepolia document anchoring failed: ${message}`,
      );
      return {
        status: 'ANCHOR_FAILED',
        mode: 'LIVE',
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
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
    if (!status.contractAddress) {
      return null;
    }

    try {
      const provider = new JsonRpcProvider(status.rpcUrl, status.chainId);
      const contract = new Contract(
        status.contractAddress,
        DOCUMENT_REGISTRY_ABI,
        provider,
      );
      const getVersionFn = contract.getFunction('getDocumentVersion');
      const record = (await getVersionFn(
        blockchainReference,
        BigInt(version),
      )) as [
        string,
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
      if (!record[9]) {
        return null;
      }
      return {
        assetId: record[0],
        documentId: record[1],
        documentType: record[2],
        documentName: record[3],
        version: Number(record[4]),
        documentHash: normalizeReturnedHash(record[5]) ?? `0x${'0'.repeat(64)}`,
        anchoredAt: new Date(Number(record[6]) * 1000).toISOString(),
        previousVersionHash: normalizeReturnedHash(record[7]),
        offChainUri: record[8],
        blockchainReference,
        chainId: status.chainId,
        chainName: status.chainName,
        contractAddress: status.contractAddress,
        ...(await this.findAnchorTransaction({
          provider,
          contract,
          blockchainReference,
          assetId: record[0],
          documentId: record[1],
          documentType: record[2],
          documentName: record[3],
          version: Number(record[4]),
          documentHash: record[5],
          offChainUri: record[8],
        })),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'on-chain lookup failed';
      this.logger.warn(`Sepolia document version lookup failed: ${message}`);
      return null;
    }
  }

  private async findAnchorTransaction(input: {
    provider: JsonRpcProvider;
    contract: Contract;
    blockchainReference: string;
    assetId: string;
    documentId: string;
    documentType: string;
    documentName: string;
    version: number;
    documentHash: string;
    offChainUri: string;
  }): Promise<{ transactionHash?: string; explorerUrl?: string }> {
    try {
      const event = input.contract.getEvent('DocumentVersionAnchored');
      const expectedHash = normalizeHash(input.documentHash).toLowerCase();
      const latestBlock = await input.provider.getBlockNumber();
      const maxLookback = 100_000;
      const maxRange = 50_000;
      const startBlock = Math.max(0, latestBlock - maxLookback);

      for (let toBlock = latestBlock; toBlock >= startBlock; toBlock -= maxRange) {
        const fromBlock = Math.max(startBlock, toBlock - maxRange + 1);
        const logs = await input.contract.queryFilter(
          event,
          fromBlock,
          toBlock,
        );
        const match = [...logs]
          .reverse()
          .find((log) => {
            const args = 'args' in log ? log.args : undefined;
            if (!args) {
              return false;
            }
            return (
              String(args.lineageKey).toLowerCase() ===
                input.blockchainReference.toLowerCase() &&
              String(args.assetId) === input.assetId &&
              String(args.documentId) === input.documentId &&
              String(args.documentType) === input.documentType &&
              String(args.documentName) === input.documentName &&
              Number(args.version) === input.version &&
              String(args.documentHash).toLowerCase() === expectedHash &&
              String(args.offChainUri) === input.offChainUri
            );
          });

        if (match) {
          return {
            transactionHash: match.transactionHash,
            explorerUrl: transactionExplorerUrl(
              match.transactionHash,
              this.networks.selected().explorerBase,
            ),
          };
        }
      }
      return {};
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'anchor event lookup failed';
      this.logger.warn(`Sepolia anchor event lookup failed: ${message}`);
      return {};
    }
  }

  private buildWallet(
    config: BlockchainNetworkConfig,
    provider?: JsonRpcProvider,
  ): Wallet | HDNodeWallet {
    const mnemonic = config.mnemonic;
    if (mnemonic) {
      const wallet = HDNodeWallet.fromPhrase(mnemonic);
      return provider ? wallet.connect(provider) : wallet;
    }
    const privateKey = config.privateKey;
    if (!privateKey) {
      throw new Error(
        `Missing signer credentials for ${config.chainName}`,
      );
    }
    return new Wallet(privateKey, provider);
  }

  private async resolveBlockTimestamp(
    provider: JsonRpcProvider,
    blockNumber: number,
  ): Promise<string> {
    const block = await provider.getBlock(blockNumber);
    if (!block?.timestamp) {
      return new Date().toISOString();
    }
    return new Date(block.timestamp * 1000).toISOString();
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
