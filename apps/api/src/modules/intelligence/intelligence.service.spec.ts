import { IntelligenceService } from './intelligence.service';
import {
  emptyStore,
  type AssetDnaSnapshotRecord,
} from '../../infrastructure/database/models';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { AuditService } from '../audit/audit.service';
import type { LlmModelsService } from './llm-models.service';
import type { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import type { AuthUser } from '../../common/types/auth-user';

describe('IntelligenceService', () => {
  const user: AuthUser = {
    id: 'usr_test',
    email: 'test@example.com',
    fullName: 'Test User',
    organizationId: 'org_test',
    organizationName: 'Test Org',
    organizationSlug: 'test-org',
    roles: ['ORG_ADMIN'],
  };

  it('reuses the latest DNA snapshot when the current document versions are unchanged', async () => {
    const store = emptyStore();
    store.assets.push({
      id: 'ast_test',
      organizationId: user.organizationId,
      name: 'Test asset',
      assetClass: 'REAL_ESTATE',
      status: 'ACTIVE',
      currency: 'INR',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    store.documents.push({
      id: 'doc_current',
      organizationId: user.organizationId,
      assetId: 'ast_test',
      name: 'Title deed',
      originalFilename: 'title.pdf',
      type: 'TITLE_DEED',
      status: 'READY',
      mimeType: 'application/pdf',
      storageKey: 'title.pdf',
      sizeBytes: 1,
      extractedText: 'title',
      groupKey: 'ast_test:TITLE_DEED:title',
      version: 1,
      isCurrent: true,
      uploadedByUserId: user.id,
      hashAlgorithm: 'sha256',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    store.dnaSnapshots.push({
      id: 'dna_1',
      assetId: 'ast_test',
      version: 1,
      contentHash: 'hash',
      hashAlgorithm: 'sha256',
      createdAt: '2026-01-01T00:00:01.000Z',
      envelope: { version: 1, sourceDocumentIds: ['doc_current'] },
    } as AssetDnaSnapshotRecord);

    const db = {
      snapshot: store,
      mutate: jest.fn(),
    } as unknown as DatabaseService;
    const service = new IntelligenceService(
      db,
      {} as AuditService,
      {} as LlmModelsService,
      {} as EthereumSepoliaTokenService,
    );

    const result = await service.runPipeline(user, 'ast_test');

    expect(result).toEqual(expect.objectContaining({ version: 1 }));
    expect(db.mutate).not.toHaveBeenCalled();
  });
});
