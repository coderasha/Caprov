import { createHash } from 'node:crypto';
import { id as ethId } from 'ethers';
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  emptyStore,
  type CaprovData,
} from '../../infrastructure/database/models';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { StorageService } from '../../infrastructure/storage/storage.service';
import type { AuditService } from '../audit/audit.service';
import type {
  AnchoredDocumentVersionRecord,
  BlockchainAdapter,
} from '../../infrastructure/blockchain/blockchain.adapter';
import type { AuthUser } from '../../common/types/auth-user';

describe('DocumentsService', () => {
  const user: AuthUser = {
    id: 'usr_test',
    email: 'test@caprov.io',
    fullName: 'Test User',
    organizationId: 'org_test',
    organizationName: 'Test Org',
    organizationSlug: 'test-org',
    roles: ['ORG_ADMIN'],
  };

  it('keeps simulated anchors out of the blockchain-anchored state', async () => {
    const store = buildStore();
    const document = store.documents[0]!;
    store.provenanceAnchors.push({
      id: 'anc_doc',
      organizationId: user.organizationId,
      assetId: document.assetId,
      documentId: document.id,
      kind: 'DOCUMENT',
      hashAlgorithm: 'sha256',
      hashValue: 'anchor-hash',
      status: 'SIMULATED',
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      txHash:
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      explorerUrl:
        'https://sepolia.etherscan.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111',
      mode: 'SIMULATED',
      anchoredAt: '2026-09-03T15:28:44.072Z',
      metadata: {
        sourceName: document.name,
        sourceType: document.type,
      },
    });

    const service = createService({
      store,
      blockchain: createBlockchainMock({
        getAnchoredDocumentVersion: jest.fn().mockResolvedValue(null),
      }),
    });

    const result = await service.verify(user.organizationId, document.id);

    expect(result.effectiveAnchorStatus).toBe('SIMULATED');
    expect(result.effectiveAnchorMode).toBe('LIVE');
    expect(result.transactionHash).toBeUndefined();
  });

  it('verifies documents using the corrected-case blockchain reference and syncs anchor evidence', async () => {
    const store = buildStore();
    const document = store.documents[0]!;
    const legacyReference = ethId(
      `${document.assetId}|${document.type}|${document.name.toLowerCase()}`,
    );
    document.blockchainReference = legacyReference;
    store.provenanceAnchors.push({
      id: 'anc_doc',
      organizationId: user.organizationId,
      assetId: document.assetId,
      documentId: document.id,
      kind: 'DOCUMENT',
      hashAlgorithm: 'sha256',
      hashValue: 'anchor-hash',
      status: 'SIMULATED',
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      explorerUrl:
        'https://sepolia.etherscan.io/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      mode: 'SIMULATED',
      anchoredAt: '2026-09-03T15:28:44.072Z',
      metadata: {
        sourceName: document.name,
        sourceType: document.type,
      },
    });

    const expectedReference = ethId(
      `${document.assetId}|${document.type}|${document.name}`,
    );
    const onChainRecord: AnchoredDocumentVersionRecord = {
      assetId: document.assetId!,
      documentId: document.id,
      documentType: document.type,
      documentName: document.name,
      version: document.version,
      documentHash: document.documentHash!,
      previousVersionHash: document.previousVersionHash,
      offChainUri: document.offChainUri!,
      anchoredAt: '2026-09-03T15:30:00.000Z',
      blockchainReference: expectedReference,
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      contractAddress: '0xRegistry',
      transactionHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      explorerUrl:
        'https://sepolia.etherscan.io/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };

    const getAnchoredDocumentVersion = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(onChainRecord);

    const service = createService({
      store,
      blockchain: createBlockchainMock({
        getAnchoredDocumentVersion,
      }),
    });

    const result = await service.verify(user.organizationId, document.id);

    expect(getAnchoredDocumentVersion).toHaveBeenNthCalledWith(
      1,
      legacyReference,
      document.version,
    );
    expect(getAnchoredDocumentVersion).toHaveBeenNthCalledWith(
      2,
      expectedReference,
      document.version,
    );
    expect(result.effectiveAnchorStatus).toBe('BLOCKCHAIN_ANCHORED');
    expect(store.documents[0]?.blockchainReference).toBe(expectedReference);
    expect(store.documents[0]?.anchorTxHash).toBe(onChainRecord.transactionHash);
    expect(store.provenanceAnchors[0]?.status).toBe('CONFIRMED');
    expect(store.provenanceAnchors[0]?.mode).toBe('LIVE');
    expect(store.provenanceAnchors[0]?.txHash).toBe(onChainRecord.transactionHash);
  });

  it('does not replace a document anchor transaction with a later provenance transaction', async () => {
    const store = buildStore();
    const document = store.documents[0]!;
    document.anchorStatus = 'BLOCKCHAIN_ANCHORED';
    document.anchorMode = 'LIVE';
    document.anchorTxHash =
      '0x1111111111111111111111111111111111111111111111111111111111111111';
    document.anchorExplorerUrl = `https://sepolia.etherscan.io/tx/${document.anchorTxHash}`;
    document.anchoredAt = '2026-09-03T17:36:07.771Z';
    store.provenanceAnchors.push({
      id: 'anc_doc',
      organizationId: user.organizationId,
      assetId: document.assetId,
      documentId: document.id,
      kind: 'DOCUMENT',
      hashAlgorithm: 'sha256',
      hashValue: 'anchor-hash',
      status: 'CONFIRMED',
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      txHash:
        '0x2222222222222222222222222222222222222222222222222222222222222222',
      explorerUrl:
        'https://sepolia.etherscan.io/tx/0x2222222222222222222222222222222222222222222222222222222222222222',
      mode: 'LIVE',
      anchoredAt: '2026-09-03T17:36:08.362Z',
      metadata: {
        sourceName: document.name,
        sourceType: document.type,
      },
    });

    const service = createService({
      store,
      blockchain: createBlockchainMock({
        getAnchoredDocumentVersion: jest.fn().mockResolvedValue(null),
      }),
    });

    const result = await service.verify(user.organizationId, document.id);

    expect(result.transactionHash).toBe(document.anchorTxHash);
    expect(store.documents[0]?.anchorTxHash).toBe(document.anchorTxHash);
    expect(store.provenanceAnchors[0]?.txHash).toBe(
      '0x2222222222222222222222222222222222222222222222222222222222222222',
    );
  });

  it('rejects a submitted wallet transaction when it does not match the verified on-chain tx', async () => {
    const store = buildStore();
    const document = store.documents[0]!;
    const verifiedTransactionHash =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const service = createService({
      store,
      blockchain: createBlockchainMock({
        getAnchoredDocumentVersion: jest.fn().mockResolvedValue({
          assetId: document.assetId!,
          documentId: document.id,
          documentType: document.type,
          documentName: document.name,
          version: document.version,
          documentHash: document.documentHash!,
          previousVersionHash: document.previousVersionHash,
          offChainUri: document.offChainUri!,
          anchoredAt: '2026-09-03T15:30:00.000Z',
          blockchainReference: document.blockchainReference!,
          chainId: 11155111,
          chainName: 'Ethereum Sepolia',
          contractAddress: '0xRegistry',
          transactionHash: verifiedTransactionHash,
          explorerUrl: `https://sepolia.etherscan.io/tx/${verifiedTransactionHash}`,
        }),
      }),
    });

    await expect(
      service.recordWalletAnchor(user, document.id, {
        transactionHash:
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates asset documents as not anchorable when live Sepolia anchoring is not configured', async () => {
    const store = emptyStore();
    store.users.push({
      id: 'usr_test',
      email: 'test@caprov.io',
      passwordHash: 'hash',
      fullName: 'Test User',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    store.assets.push({
      id: 'ast_test',
      organizationId: 'org_test',
      name: 'TBW asset',
      assetClass: 'REAL_ESTATE',
      status: 'ACTIVE',
      currency: 'USD',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });

    const service = createService({
      store,
      blockchain: createBlockchainMock({
        getDocumentNetworkStatus: jest.fn().mockReturnValue({
          chainId: 11155111,
          chainName: 'Ethereum Sepolia',
          rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
          explorerBase: 'https://sepolia.etherscan.io',
          contractAddress: undefined,
          mode: 'SIMULATED',
          liveReady: false,
          message: 'Document anchoring is not ready.',
        }),
      }),
    });

    const created = await service.create(user, {
      assetId: 'ast_test',
      name: 'Unanchored Doc',
      type: 'OTHER',
      extractedText: 'plain text body',
    });

    expect(created.anchorStatus).toBe('NOT_APPLICABLE');
    expect(created.anchorMode).toBeUndefined();
    expect(created.anchorContractAddress).toBeUndefined();
  });
});

function buildStore(): CaprovData {
  const store = emptyStore();
  const content = Buffer.from('test document content', 'utf8');
  const documentHash = `0x${createHash('sha256').update(content).digest('hex')}`;
  store.users.push({
    id: 'usr_test',
    email: 'test@caprov.io',
    passwordHash: 'hash',
    fullName: 'Test User',
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  });
  store.assets.push({
    id: 'ast_test',
    organizationId: 'org_test',
    name: 'TBW asset',
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    currency: 'USD',
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  });
  store.documents.push({
    id: 'doc_test',
    organizationId: 'org_test',
    assetId: 'ast_test',
    name: 'LMN_Asset_KYC_Ownership',
    originalFilename: 'LMN_Asset_KYC_Ownership.docx',
    type: 'KYC',
    status: 'READY',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storageKey: 'ast_test/KYC/doc.docx',
    sizeBytes: content.byteLength,
    extractedText: 'doc text',
    groupKey: 'ast_test:KYC:lmn_asset_kyc_ownership',
    version: 1,
    isCurrent: true,
    uploadedByUserId: 'usr_test',
    previousVersionHash: undefined,
    documentHash,
    hashAlgorithm: 'sha256',
    offChainUri: 'caprov://storage/ast_test/KYC/doc.docx',
    anchorStatus: 'PENDING',
    anchorMode: 'LIVE',
    anchorChainId: 11155111,
    anchorChainName: 'Ethereum Sepolia',
    anchorContractAddress: '0xRegistry',
    blockchainReference: ethId('ast_test|KYC|LMN_Asset_KYC_Ownership'),
    createdAt: '2026-09-03T15:28:43.211Z',
  });
  return store;
}

function createService(input: {
  store: CaprovData;
  blockchain?: BlockchainAdapter;
}) {
  const storage = {
    save: jest.fn((name: string, _buffer: Buffer, mimeType: string, folder: string) => ({
      storageKey: `${folder}/${name}`,
      mimeType,
      uri: `caprov://storage/${folder}/${name}`,
    })),
    readBuffer: jest
      .fn()
      .mockReturnValue(Buffer.from('test document content', 'utf8')),
  } as unknown as StorageService;
  const audit = {
    log: jest.fn(),
  } as unknown as AuditService;

  return new DocumentsService(
    createDbMock(input.store),
    storage,
    audit,
    input.blockchain ?? createBlockchainMock(),
  );
}

function createDbMock(store: CaprovData): DatabaseService {
  return {
    get snapshot() {
      return store;
    },
    mutate<T>(fn: (draft: CaprovData) => T): T {
      return fn(store);
    },
    async mutateWithDocumentLock<T>(
      _documentId: string,
      fn: (draft: CaprovData) => T,
    ): Promise<T> {
      return fn(store);
    },
  } as DatabaseService;
}

function createBlockchainMock(
  overrides: Partial<BlockchainAdapter> = {},
): BlockchainAdapter {
  return {
    getDocumentNetworkStatus: jest.fn().mockReturnValue({
      chainId: 11155111,
      chainName: 'Ethereum Sepolia',
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      explorerBase: 'https://sepolia.etherscan.io',
      contractAddress: '0xRegistry',
      mode: 'LIVE',
      liveReady: true,
      message: 'Live',
    }),
    buildDocumentBlockchainReference: jest.fn((assetId, documentType, documentName) =>
      ethId(`${assetId}|${documentType}|${documentName.trim()}`),
    ),
    anchorDocumentVersion: jest.fn(),
    getAnchoredDocumentVersion: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}
