import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentType } from '@caprov/types';
import type { AuthUser } from '../../common/types/auth-user';
import {
  DOCUMENT_BLOCKCHAIN_ADAPTER,
  type BlockchainAdapterNetworkStatus,
  type BlockchainAdapter,
} from '../../infrastructure/blockchain/blockchain.adapter';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import type { DocumentRecord } from '../../infrastructure/database/models';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import {
  extractFactsAccurate,
  normalizeExtractionText,
} from '../intelligence/extraction-accuracy';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(DOCUMENT_BLOCKCHAIN_ADAPTER)
    private readonly blockchain: BlockchainAdapter,
  ) {}

  list(organizationId: string, assetId?: string, currentOnly = false) {
    return this.db.snapshot.documents
      .filter((document) => {
        if (document.organizationId !== organizationId) {
          return false;
        }
        if (assetId && document.assetId !== assetId) {
          return false;
        }
        if (currentOnly && !document.isCurrent) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) {
          return a.isCurrent ? -1 : 1;
        }
        if (a.groupKey === b.groupKey) {
          return b.version - a.version;
        }
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map((document) => this.toDocumentRow(document));
  }

  getNetworkStatus(): BlockchainAdapterNetworkStatus {
    return this.blockchain.getDocumentNetworkStatus();
  }

  folders(organizationId: string, assetId: string) {
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === assetId && item.organizationId === organizationId,
    );
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const documents = this.db.snapshot.documents.filter(
      (item) => item.organizationId === organizationId && item.assetId === assetId,
    );

    const folders = documentTypeOrder.map((type) => {
      const inCategory = documents.filter((item) => item.type === type);
      const currentDocuments = inCategory.filter((item) => item.isCurrent);
      const lineages = new Map<string, DocumentRecord[]>();
      for (const document of inCategory) {
        const bucket = lineages.get(document.groupKey) ?? [];
        bucket.push(document);
        lineages.set(document.groupKey, bucket);
      }
      const entries = Array.from(lineages.values())
        .map((versions) => versions.sort((a, b) => b.version - a.version))
        .map((versions) => {
          const current = versions[0]!;
          return {
            id: current.id,
            name: current.name,
            originalFilename: current.originalFilename,
            currentVersion: current.version,
            versionCount: versions.length,
            uploadedAt: current.createdAt,
            uploadedByUserId: current.uploadedByUserId,
            uploadedBy:
              this.db.snapshot.users.find((user) => user.id === current.uploadedByUserId)
                ?.fullName ?? null,
            status: current.isCurrent ? 'CURRENT' : 'PREVIOUS',
            documentStatus: current.status,
            anchorStatus: current.anchorStatus,
            storageKey: current.storageKey,
            versions: versions.map((version) => this.toDocumentRow(version)),
          };
        })
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

      return {
        type,
        folderName: documentFolderName(type),
        documentCount: currentDocuments.length,
        totalVersions: inCategory.length,
        entries,
      };
    });

    return {
      asset: { id: asset.id, name: asset.name },
      folders,
    };
  }

  get(organizationId: string, documentId: string) {
    const document = this.requireDocument(organizationId, documentId);
    const facts = [
      ...this.db.snapshot.facts.filter(
        (item) => item.documentId === documentId,
      ),
    ]
      .sort((a, b) => b.confidence - a.confidence)
      .filter((fact, index, all) => {
        const first = all.findIndex(
          (item) => item.key === fact.key && item.value === fact.value,
        );
        return first === index;
      });
    return {
      ...document,
      uploadedBy:
        this.db.snapshot.users.find((item) => item.id === document.uploadedByUserId)
          ?.fullName ?? null,
      versionStatus: document.isCurrent ? 'CURRENT' : 'PREVIOUS',
      facts,
    };
  }

  history(organizationId: string, documentId: string) {
    const document = this.requireDocument(organizationId, documentId);
    return this.db.snapshot.documents
      .filter(
        (item) =>
          item.organizationId === organizationId &&
          item.groupKey === document.groupKey,
      )
      .sort((a, b) => b.version - a.version)
      .map((item) => this.toDocumentRow(item));
  }

  async verify(organizationId: string, documentId: string) {
    const document = this.requireDocument(organizationId, documentId);

    const content = this.storage.readBuffer(document.storageKey);
    const recalculatedHash = content ? sha256(content) : undefined;
    const storedHash = document.documentHash?.toLowerCase();
    const onChain = document.blockchainReference
      ? await this.blockchain.getAnchoredDocumentVersion(
          document.blockchainReference,
          document.version,
        )
      : null;
    const onChainHash = onChain?.documentHash?.toLowerCase();
    const matchesStored = Boolean(
      recalculatedHash && storedHash && recalculatedHash === storedHash,
    );
    const matchesOnChain = Boolean(
      recalculatedHash && onChainHash && recalculatedHash === onChainHash,
    );
    const effectiveAnchorStatus =
      matchesOnChain
        ? 'BLOCKCHAIN_ANCHORED'
        : document.anchorStatus;
    const effectiveAnchorMode =
      matchesOnChain
        ? 'LIVE'
        : document.anchorMode;
    const effectiveTransactionHash = onChain?.transactionHash ?? document.anchorTxHash;
    const effectiveExplorerUrl = onChain?.explorerUrl ?? document.anchorExplorerUrl;
    const transactionRecorded = Boolean(effectiveTransactionHash);

    return {
      documentId: document.id,
      assetId: document.assetId,
      documentType: document.type,
      version: document.version,
      isCurrent: document.isCurrent,
      offChainUri: document.offChainUri,
      storageKey: document.storageKey,
      anchorStatus: document.anchorStatus,
      anchorMode: document.anchorMode,
      transactionHash: effectiveTransactionHash,
      explorerUrl: effectiveExplorerUrl,
      blockchainReference: document.blockchainReference,
      recalculatedHash,
      storedHash,
      onChainHash,
      matchesStored,
      matchesOnChain,
      authentic: matchesStored && matchesOnChain,
      effectiveAnchorStatus,
      effectiveAnchorMode,
      transactionRecorded,
      anchoredAt: onChain?.anchoredAt ?? document.anchoredAt,
      onChainRecord: onChain,
      history: this.history(organizationId, document.id),
    };
  }

  async recordWalletAnchor(
    user: AuthUser,
    documentId: string,
    input: {
      transactionHash: string;
      walletAddress: string;
    },
  ) {
    const document = this.requireDocument(user.organizationId, documentId);
    if (!document.assetId || !document.documentHash || !document.blockchainReference) {
      throw new BadRequestException(
        'This document version is missing blockchain anchor metadata.',
      );
    }

    const network = this.blockchain.getDocumentNetworkStatus();
    if (!network.contractAddress) {
      throw new BadRequestException(
        'Ethereum Sepolia document registry contract is not configured.',
      );
    }

    const onChain = await this.blockchain.getAnchoredDocumentVersion(
      document.blockchainReference,
      document.version,
    );
    if (!onChain) {
      throw new BadRequestException(
        'The document version could not be found on Ethereum Sepolia.',
      );
    }
    if (onChain.documentHash.toLowerCase() !== normalizeStoredHash(document.documentHash)) {
      throw new BadRequestException(
        'The on-chain document hash does not match the stored document hash.',
      );
    }

    this.db.mutate((draft) => {
      const target = draft.documents.find((item) => item.id === document.id);
      if (!target) {
        return;
      }
      target.anchorStatus = 'BLOCKCHAIN_ANCHORED';
      target.anchorMode = 'LIVE';
      target.anchorChainId = network.chainId;
      target.anchorChainName = network.chainName;
      target.anchorContractAddress = network.contractAddress;
      target.anchorTxHash = input.transactionHash;
      target.anchorExplorerUrl = `${network.explorerBase}/tx/${input.transactionHash}`;
      target.anchoredAt = onChain.anchoredAt;
      target.blockchainReference = document.blockchainReference;
    });

    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'document.anchor.recorded',
      entityType: 'Document',
      entityId: document.id,
      metadata: {
        assetId: document.assetId,
        version: document.version,
        walletAddress: input.walletAddress,
        transactionHash: input.transactionHash,
        blockchainReference: document.blockchainReference,
      },
    });

    return this.get(user.organizationId, document.id);
  }

  getCurrentAssetDocuments(organizationId: string, assetId: string) {
    return this.db.snapshot.documents.filter(
      (item) =>
        item.organizationId === organizationId &&
        item.assetId === assetId &&
        item.isCurrent !== false,
    );
  }

  async create(
    user: AuthUser,
    input: {
      name: string;
      type: DocumentType;
      assetId?: string;
      mimeType?: string;
      buffer?: Buffer;
      extractedText?: string;
      originalFilename?: string;
    },
  ) {
    if (!input.assetId) {
      throw new NotFoundException('An asset is required for document upload');
    }
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === input.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const text = this.extractText(input);
    const payload =
      input.buffer ?? (text ? Buffer.from(text, 'utf8') : undefined);
    const mimeType =
      input.mimeType ??
      (input.buffer ? 'application/octet-stream' : 'text/plain');
    const stored = payload
      ? this.storage.save(
          input.originalFilename || input.name,
          payload,
          mimeType,
          `${input.assetId}/${documentFolderName(input.type)}`,
        )
      : {
          storageKey: `${input.assetId}/${documentFolderName(input.type)}/inline/${createId('txt')}.txt`,
          mimeType: 'text/plain',
          uri: '',
        };
    const now = new Date().toISOString();
    const documentId = createId('doc');
    const lineageKey = buildDocumentGroupKey(input.assetId, input.type, input.name);
    const previous = this.db.snapshot.documents
      .filter(
        (item) =>
          item.organizationId === user.organizationId &&
          item.groupKey === lineageKey &&
          item.isCurrent,
      )
      .sort((a, b) => b.version - a.version)[0];
    const version = previous ? previous.version + 1 : 1;
    const documentHash = payload ? sha256(payload) : undefined;
    const network = this.blockchain.getDocumentNetworkStatus();
    const blockchainReference =
      input.assetId && documentHash
        ? this.blockchain.buildDocumentBlockchainReference(
            input.assetId,
            input.type,
            input.name,
          )
        : undefined;

    const document: DocumentRecord = {
      id: documentId,
      organizationId: user.organizationId,
      assetId: input.assetId,
      name: input.name,
      type: input.type,
      status: text ? 'READY' : 'UPLOADED',
      mimeType: stored.mimeType,
      storageKey: stored.storageKey,
      sizeBytes: payload?.byteLength ?? text?.length ?? 0,
      extractedText: text,
      originalFilename: input.originalFilename || input.name,
      groupKey: lineageKey,
      version,
      isCurrent: true,
      previousDocumentId: previous?.id,
      uploadedByUserId: user.id,
      previousVersionHash: previous?.documentHash,
      documentHash,
      hashAlgorithm: 'sha256',
      offChainUri: stored.uri,
      anchorStatus: input.assetId
        ? 'PENDING'
        : 'NOT_APPLICABLE',
      anchorMode: network.contractAddress ? 'LIVE' : undefined,
      anchorChainId: network.contractAddress ? network.chainId : undefined,
      anchorChainName: network.contractAddress ? network.chainName : undefined,
      anchorContractAddress: network.contractAddress,
      anchorTxHash: undefined,
      anchorExplorerUrl: undefined,
      anchoredAt: undefined,
      blockchainReference,
      createdAt: now,
    };

    this.db.mutate((draft) => {
      if (previous) {
        const previousCurrent = draft.documents.find(
          (item) => item.id === previous.id,
        );
        if (previousCurrent) {
          previousCurrent.isCurrent = false;
        }
      }
      draft.documents.unshift(document);
      if (text) {
        const facts = extractFactsAccurate([
          {
            id: document.id,
            name: document.name,
            type: document.type,
            extractedText: text,
          },
        ]);
        draft.facts.push(
          ...facts.map((fact) => ({
            id: fact.id,
            documentId: document.id,
            key: fact.key,
            value: fact.value,
            confidence: fact.confidence,
            fragment: fact.provenance[0]?.sourceFragment,
            observedAt: fact.provenance[0]?.observedAt ?? document.createdAt,
          })),
        );
      }
    });

    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'document.uploaded',
      entityType: 'Document',
      entityId: document.id,
      metadata: {
        assetId: input.assetId,
        type: input.type,
        version: document.version,
        anchorStatus: document.anchorStatus,
        blockchainReference: document.blockchainReference,
      },
    });
    return document;
  }

  private toDocumentRow(document: DocumentRecord) {
    return {
      ...document,
      uploadedBy:
        this.db.snapshot.users.find((item) => item.id === document.uploadedByUserId)
          ?.fullName ?? null,
      versionStatus: document.isCurrent ? 'CURRENT' : 'PREVIOUS',
      folderName: documentFolderName(document.type),
    };
  }

  private requireDocument(organizationId: string, documentId: string) {
    const document = this.db.snapshot.documents.find(
      (item) => item.id === documentId,
    );
    if (!document || document.organizationId !== organizationId) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  private isText(mimeType: string, name: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.csv') ||
      name.endsWith('.json')
    );
  }

  private extractText(input: {
    name: string;
    mimeType?: string;
    buffer?: Buffer;
    extractedText?: string;
  }): string | undefined {
    if (input.extractedText?.trim()) {
      return normalizeExtractionText(input.extractedText);
    }
    if (!input.buffer) {
      return undefined;
    }
    const mimeType = input.mimeType ?? 'application/octet-stream';
    const lowerName = input.name.toLowerCase();

    if (this.isText(mimeType, lowerName)) {
      return normalizeExtractionText(input.buffer.toString('utf8'));
    }
    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
      return this.extractPdfText(input.buffer, input.name);
    }
    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      return this.extractDocxText(input.buffer, input.name);
    }
    return undefined;
  }

  private extractPdfText(buffer: Buffer, name: string): string | undefined {
    return this.withTempFile(name, buffer, (filePath) => {
      try {
        const output = execFileSync('pdftotext', ['-layout', filePath, '-'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const text = normalizeExtractionText(output);
        return text || undefined;
      } catch {
        return undefined;
      }
    });
  }

  private extractDocxText(buffer: Buffer, name: string): string | undefined {
    return this.withTempFile(name, buffer, (filePath) => {
      try {
        const xml = execFileSync(
          'unzip',
          ['-p', filePath, 'word/document.xml'],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        );
        const text = normalizeExtractionText(this.stripOfficeXml(xml));
        return text || undefined;
      } catch {
        return undefined;
      }
    });
  }

  private withTempFile<T>(
    name: string,
    buffer: Buffer,
    fn: (filePath: string) => T,
  ): T {
    const suffix = name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const filePath = join(tmpdir(), `${createId('tmp')}-${suffix}`);
    writeFileSync(filePath, buffer);
    try {
      return fn(filePath);
    } finally {
      rmSync(filePath, { force: true });
    }
  }

  private stripOfficeXml(xml: string): string {
    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+\n/g, '\n');
  }
}

const documentTypeOrder: DocumentType[] = [
  'TITLE_DEED',
  'SPA',
  'PURCHASE_AGREEMENT',
  'VALUATION_MEMO',
  'SALE_AGREEMENT',
  'ENCUMBRANCE_CERTIFICATE',
  'KYC',
  'INSURANCE',
  'FINANCIAL_STATEMENT',
  'CAP_TABLE',
  'LPA',
  'OTHER',
];

function buildDocumentGroupKey(assetId: string, type: DocumentType, name: string) {
  return `${assetId}:${type}:${name.trim().toLowerCase()}`;
}

function normalizeStoredHash(value: string) {
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

export function documentFolderName(type: DocumentType) {
  switch (type) {
    case 'TITLE_DEED':
      return 'Title Deed';
    case 'SPA':
      return 'SPA';
    case 'PURCHASE_AGREEMENT':
      return 'Purchase Agreement';
    case 'VALUATION_MEMO':
      return 'Valuation Memo';
    case 'SALE_AGREEMENT':
      return 'Sale Agreement';
    case 'ENCUMBRANCE_CERTIFICATE':
      return 'Encumbrance Certificate';
    case 'KYC':
      return 'KYC';
    case 'INSURANCE':
      return 'Insurance';
    case 'FINANCIAL_STATEMENT':
      return 'Financial Statement';
    case 'CAP_TABLE':
      return 'Cap Table';
    case 'LPA':
      return 'LPA';
    default:
      return 'Other Documents';
  }
}

function sha256(buffer: Buffer): string {
  return `0x${createHash('sha256').update(buffer).digest('hex')}`;
}
