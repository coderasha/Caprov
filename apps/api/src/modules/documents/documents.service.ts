import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { id as ethId } from 'ethers';
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
import type {
  DocumentRecord,
  ProvenanceAnchorRecord,
} from '../../infrastructure/database/models';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { sepoliaTxExplorerUrl } from '../../infrastructure/blockchain/explorer';
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
    const provenanceAnchor = this.findLatestDocumentAnchor(
      organizationId,
      document.id,
    );
    const onChain = await this.findOnChainDocumentVersion(document);
    const onChainHash = onChain?.documentHash?.toLowerCase();
    const matchesStored = Boolean(
      recalculatedHash && storedHash && recalculatedHash === storedHash,
    );
    const matchesOnChain = Boolean(
      recalculatedHash && onChainHash && recalculatedHash === onChainHash,
    );
    const resolvedAnchor = this.resolveBestAnchorEvidence(document, {
      provenanceAnchor,
      onChain,
    });
    const effectiveAnchorStatus = matchesOnChain
      ? 'BLOCKCHAIN_ANCHORED'
      : resolvedAnchor.mode === 'LIVE' && resolvedAnchor.transactionHash
        ? 'BLOCKCHAIN_ANCHORED'
        : resolvedAnchor.mode === 'SIMULATED'
          ? 'SIMULATED'
          : document.anchorStatus;
    const effectiveAnchorMode =
      matchesOnChain
        ? 'LIVE'
        : resolvedAnchor.mode === 'LIVE'
          ? 'LIVE'
        : document.anchorMode;
    const effectiveTransactionHash = resolvedAnchor.transactionHash;
    const effectiveExplorerUrl =
      sepoliaTxExplorerUrl(effectiveTransactionHash) ??
      sepoliaTxExplorerUrl(resolvedAnchor.explorerUrl);
    const effectiveAnchoredAt = resolvedAnchor.anchoredAt;
    const transactionRecorded = Boolean(effectiveTransactionHash);
    if (
      (matchesOnChain || effectiveTransactionHash) &&
      (document.anchorStatus !== 'BLOCKCHAIN_ANCHORED' ||
        document.anchorTxHash !== effectiveTransactionHash ||
        document.anchorExplorerUrl !== effectiveExplorerUrl ||
        document.anchoredAt !== effectiveAnchoredAt)
    ) {
      this.db.mutate((draft) => {
        const target = draft.documents.find((item) => item.id === document.id);
        if (!target) {
          return;
        }
        target.anchorStatus = 'BLOCKCHAIN_ANCHORED';
        target.anchorMode = 'LIVE';
        target.anchorChainId = onChain?.chainId ?? target.anchorChainId;
        target.anchorChainName = onChain?.chainName ?? target.anchorChainName;
        target.anchorContractAddress =
          onChain?.contractAddress ?? target.anchorContractAddress;
        target.anchorTxHash = effectiveTransactionHash;
        target.anchorExplorerUrl = effectiveExplorerUrl;
        target.anchoredAt = effectiveAnchoredAt;
        target.blockchainReference =
          onChain?.blockchainReference ?? target.blockchainReference;
        this.syncDocumentProvenanceAnchor(target, draft, {
          transactionHash: effectiveTransactionHash,
          explorerUrl: effectiveExplorerUrl,
          anchoredAt: effectiveAnchoredAt,
          chainId: onChain?.chainId ?? target.anchorChainId,
          chainName: onChain?.chainName ?? target.anchorChainName,
          mode: effectiveAnchorMode ?? 'LIVE',
        });
      });
    }

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
      anchoredAt: effectiveAnchoredAt,
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

    const onChain = await this.findOnChainDocumentVersion(document);
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

    // CRITICAL FIX: Use ONLY the on-chain verified transaction hash, never fall back to unverified input
    const transactionHash = onChain.transactionHash;
    if (!transactionHash) {
      throw new BadRequestException(
        'Ethereum Sepolia transaction hash could not be verified. Please anchor the document again.',
      );
    }
    if (input.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
      throw new BadRequestException(
        'The submitted transaction hash does not match the verified Ethereum Sepolia anchor transaction.',
      );
    }

    const explorerUrl = sepoliaTxExplorerUrl(transactionHash);
    if (!explorerUrl) {
      throw new BadRequestException(
        'Transaction hash format is invalid.',
      );
    }

    // CRITICAL FIX: Use document-level locking to prevent race conditions
    await this.db.mutateWithDocumentLock(document.id, (draft) => {
      // Re-read the document inside the lock to ensure we have the latest state
      const target = draft.documents.find((item) => item.id === document.id);
      if (!target) {
        throw new BadRequestException('Document was deleted.');
      }

      // Prevent duplicate anchoring of the same document
      if (target.anchorStatus === 'BLOCKCHAIN_ANCHORED' && target.anchorTxHash) {
        throw new BadRequestException(
          'This document version has already been anchored on Ethereum Sepolia.',
        );
      }

      target.anchorStatus = 'BLOCKCHAIN_ANCHORED';
      target.anchorMode = 'LIVE';
      target.anchorChainId = network.chainId;
      target.anchorChainName = network.chainName;
      target.anchorContractAddress = network.contractAddress;
      target.anchorTxHash = transactionHash;
      target.anchorExplorerUrl = explorerUrl;
      target.anchoredAt = onChain.anchoredAt;
      target.blockchainReference = onChain.blockchainReference;
      this.syncDocumentProvenanceAnchor(target, draft, {
        transactionHash,
        explorerUrl,
        anchoredAt: onChain.anchoredAt,
        chainId: network.chainId,
        chainName: network.chainName,
        mode: 'LIVE',
      });
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
        transactionHash: transactionHash,
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
        ? network.liveReady
          ? 'PENDING'
          : 'NOT_APPLICABLE'
        : 'NOT_APPLICABLE',
      anchorMode: network.liveReady ? 'LIVE' : undefined,
      anchorChainId: network.liveReady ? network.chainId : undefined,
      anchorChainName: network.liveReady ? network.chainName : undefined,
      anchorContractAddress: network.liveReady ? network.contractAddress : undefined,
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

  private async findOnChainDocumentVersion(document: DocumentRecord) {
    for (const reference of this.buildBlockchainReferenceCandidates(document)) {
      const onChain = await this.blockchain.getAnchoredDocumentVersion(
        reference,
        document.version,
      );
      if (onChain) {
        return {
          ...onChain,
          blockchainReference: reference,
        };
      }
    }
    return null;
  }

  private buildBlockchainReferenceCandidates(document: DocumentRecord): string[] {
    const references = new Set<string>();
    if (document.blockchainReference) {
      references.add(document.blockchainReference);
    }
    if (document.assetId) {
      references.add(
        this.blockchain.buildDocumentBlockchainReference(
          document.assetId,
          document.type,
          document.name,
        ),
      );
      references.add(
        legacyDocumentBlockchainReference(
          document.assetId,
          document.type,
          document.name,
        ),
      );
    }
    return [...references];
  }

  private findLatestDocumentAnchor(
    organizationId: string,
    documentId: string,
  ): ProvenanceAnchorRecord | undefined {
    return this.db.snapshot.provenanceAnchors
      .filter(
        (item) =>
          item.organizationId === organizationId &&
          item.kind === 'DOCUMENT' &&
          item.documentId === documentId,
      )
      .sort((a, b) => b.anchoredAt.localeCompare(a.anchoredAt))[0];
  }

  private resolveBestAnchorEvidence(
    document: DocumentRecord,
    input: {
      provenanceAnchor?: ProvenanceAnchorRecord;
      onChain?: {
        transactionHash?: string;
        explorerUrl?: string;
        anchoredAt: string;
      } | null;
    },
  ): {
    transactionHash?: string;
    explorerUrl?: string;
    anchoredAt?: string;
    mode?: 'LIVE' | 'SIMULATED';
  } {
    if (input.onChain) {
      return {
        transactionHash: input.onChain.transactionHash,
        explorerUrl: input.onChain.explorerUrl,
        anchoredAt: input.onChain.anchoredAt,
        mode: 'LIVE',
      };
    }
    if (document.anchorTxHash || document.anchorExplorerUrl || document.anchoredAt) {
      return {
        transactionHash: document.anchorTxHash,
        explorerUrl: document.anchorExplorerUrl,
        anchoredAt: document.anchoredAt,
        mode: document.anchorMode,
      };
    }
    if (input.provenanceAnchor) {
      return {
        anchoredAt: input.provenanceAnchor.anchoredAt,
        mode: input.provenanceAnchor.mode,
      };
    }
    return {};
  }

  private syncDocumentProvenanceAnchor(
    document: DocumentRecord,
    draft: { provenanceAnchors: ProvenanceAnchorRecord[] },
    input: {
      transactionHash?: string;
      explorerUrl?: string;
      anchoredAt?: string;
      chainId?: number;
      chainName?: string;
      mode: 'LIVE' | 'SIMULATED';
    },
  ) {
    const anchor = [...draft.provenanceAnchors]
      .filter(
        (item) =>
          item.organizationId === document.organizationId &&
          item.kind === 'DOCUMENT' &&
          item.documentId === document.id,
      )
      .sort((a, b) => b.anchoredAt.localeCompare(a.anchoredAt))[0];
    if (!anchor) {
      return;
    }
    anchor.status = input.mode === 'LIVE' ? 'CONFIRMED' : 'SIMULATED';
    anchor.mode = input.mode;
    anchor.txHash = input.transactionHash;
    anchor.explorerUrl = input.explorerUrl;
    anchor.anchoredAt = input.anchoredAt ?? anchor.anchoredAt;
    anchor.chainId = input.chainId ?? anchor.chainId;
    anchor.chainName = input.chainName ?? anchor.chainName;
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

function legacyDocumentBlockchainReference(
  assetId: string,
  documentType: string,
  documentName: string,
) {
  return ethId(`${assetId}|${documentType}|${documentName.trim().toLowerCase()}`);
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
