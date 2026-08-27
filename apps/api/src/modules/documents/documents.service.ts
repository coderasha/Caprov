import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentType } from '@caprov/types';
import type { AuthUser } from '../../common/types/auth-user';
import {
  DOCUMENT_BLOCKCHAIN_ADAPTER,
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
      });
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
    return { ...document, facts };
  }

  history(organizationId: string, documentId: string) {
    const document = this.requireDocument(organizationId, documentId);
    return this.db.snapshot.documents
      .filter(
        (item) =>
          item.organizationId === organizationId &&
          item.groupKey === document.groupKey,
      )
      .sort((a, b) => b.version - a.version);
  }

  async verify(organizationId: string, documentId: string) {
    const requested = this.requireDocument(organizationId, documentId);
    const current =
      this.db.snapshot.documents.find(
        (item) =>
          item.organizationId === organizationId &&
          item.groupKey === requested.groupKey &&
          item.isCurrent,
      ) ?? requested;

    const content = this.storage.readBuffer(current.storageKey);
    const recalculatedHash = content ? sha256(content) : undefined;
    const storedHash = current.documentHash?.toLowerCase();
    const onChain = current.blockchainReference
      ? await this.blockchain.getAnchoredDocumentVersion(
          current.blockchainReference,
          current.version,
        )
      : null;
    const onChainHash = onChain?.documentHash?.toLowerCase();
    const matchesStored = Boolean(
      recalculatedHash && storedHash && recalculatedHash === storedHash,
    );
    const matchesOnChain = Boolean(
      recalculatedHash && onChainHash && recalculatedHash === onChainHash,
    );

    return {
      documentId: current.id,
      assetId: current.assetId,
      documentType: current.type,
      version: current.version,
      isCurrent: current.isCurrent,
      offChainUri: current.offChainUri,
      storageKey: current.storageKey,
      anchorStatus: current.anchorStatus,
      anchorMode: current.anchorMode,
      transactionHash: current.anchorTxHash,
      explorerUrl: current.anchorExplorerUrl,
      blockchainReference: current.blockchainReference,
      recalculatedHash,
      storedHash,
      onChainHash,
      matchesStored,
      matchesOnChain,
      authentic: matchesStored && matchesOnChain,
      onChainRecord: onChain,
      history: this.history(organizationId, current.id),
    };
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
    },
  ) {
    const text = this.extractText(input);
    const payload =
      input.buffer ?? (text ? Buffer.from(text, 'utf8') : undefined);
    const mimeType =
      input.mimeType ??
      (input.buffer ? 'application/octet-stream' : 'text/plain');
    const stored = payload
      ? this.storage.save(input.name, payload, mimeType)
      : {
          storageKey: `inline/${createId('txt')}.txt`,
          mimeType: 'text/plain',
          uri: '',
        };
    const now = new Date().toISOString();
    const documentId = createId('doc');
    const previous = input.assetId
      ? this.db.snapshot.documents
          .filter(
            (item) =>
              item.organizationId === user.organizationId &&
              item.assetId === input.assetId &&
              item.type === input.type &&
              item.isCurrent,
          )
          .sort((a, b) => b.version - a.version)[0]
      : undefined;
    const version = previous ? previous.version + 1 : 1;
    const documentHash = payload ? sha256(payload) : undefined;
    const anchorResult =
      input.assetId && documentHash
        ? await this.blockchain.anchorDocumentVersion({
            assetId: input.assetId,
            documentId,
            documentType: input.type,
            version,
            documentHash,
            previousVersionHash: previous?.documentHash,
            offChainUri: stored.uri,
            timestamp: now,
          })
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
      groupKey: input.assetId
        ? `${input.assetId}:${input.type}`
        : `standalone:${documentId}`,
      version,
      isCurrent: true,
      previousDocumentId: previous?.id,
      previousVersionHash: previous?.documentHash,
      documentHash,
      hashAlgorithm: 'sha256',
      offChainUri: stored.uri,
      anchorStatus: input.assetId
        ? anchorResult?.status === 'BLOCKCHAIN_ANCHORED'
          ? 'BLOCKCHAIN_ANCHORED'
          : anchorResult?.status === 'SIMULATED'
            ? 'SIMULATED'
            : anchorResult?.status === 'ANCHOR_FAILED'
              ? 'ANCHOR_FAILED'
              : 'PENDING'
        : 'NOT_APPLICABLE',
      anchorMode: anchorResult?.mode,
      anchorChainId: anchorResult?.chainId,
      anchorChainName: anchorResult?.chainName,
      anchorContractAddress: anchorResult?.contractAddress,
      anchorTxHash: anchorResult?.transactionHash,
      anchorExplorerUrl: anchorResult?.explorerUrl,
      anchoredAt: anchorResult?.anchoredAt,
      blockchainReference: anchorResult?.blockchainReference,
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
        transactionHash: document.anchorTxHash,
      },
    });
    return document;
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

function sha256(buffer: Buffer): string {
  return `0x${createHash('sha256').update(buffer).digest('hex')}`;
}
