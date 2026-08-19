import { TokenizationController } from './tokenization.controller';
import { emptyStore, type CaprovData } from '../../infrastructure/database/models';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { AuditService } from '../audit/audit.service';
import type { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { AssetClass, TokenPosition } from '@caprov/types';

describe('TokenizationController', () => {
  const user: AuthUser = {
    id: 'usr_test',
    email: 'test@caprov.io',
    organizationId: 'org_test',
    roles: ['ORG_ADMIN'],
  };

  it.each<AssetClass>([
    'REAL_ESTATE',
    'PRIVATE_CREDIT',
    'PRIVATE_EQUITY',
    'INFRASTRUCTURE',
    'AVIATION',
    'ART',
    'AGRICULTURE',
    'FUND',
    'OTHER',
  ])('allows tokenization for %s assets', async (assetClass) => {
    const store = buildStore(assetClass);
    const db = createDbMock(store);
    const audit = { log: jest.fn() } as unknown as AuditService;
    const sepolia = {
      mintAssetToken: jest.fn().mockResolvedValue({
        mode: 'SIMULATED',
        chainId: 11155111,
        chainName: 'Ethereum Sepolia',
        contractAddress: undefined,
        tokenId: 'tok_seed',
        supply: 1000,
        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: '0xtesthash',
        explorerUrl: 'https://sepolia.etherscan.io/tx/0xtesthash',
        status: 'SIMULATED',
      }),
      getNetworkStatus: jest.fn(),
      probeRpc: jest.fn(),
    } as unknown as EthereumSepoliaTokenService;

    const controller = new TokenizationController(db, audit, sepolia);
    const result = await controller.tokenize(user, {
      assetId: 'ast_test',
      supply: 1000,
    });

    expect(sepolia.mintAssetToken).toHaveBeenCalledWith({
      assetId: 'ast_test',
      tokenId: expect.any(String),
      supply: 1000,
      recipientAddress: undefined,
    });
    expect(result.asset).toMatchObject({
      id: 'ast_test',
      assetClass,
    });
    expect(store.tokens).toHaveLength(1);
    expect((store.tokens[0] as TokenPosition).assetId).toBe('ast_test');
  });
});

function buildStore(assetClass: AssetClass): CaprovData {
  const store = emptyStore();
  store.assets.push({
    id: 'ast_test',
    organizationId: 'org_test',
    name: `${assetClass} Asset`,
    assetClass,
    status: 'ACTIVE',
    currency: 'USD',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  });
  return store;
}

function createDbMock(store: CaprovData): DatabaseService {
  return {
    get snapshot() {
      return store;
    },
    mutate<T>(fn: (draft: CaprovData) => T): T {
      return fn(store);
    },
  } as DatabaseService;
}

