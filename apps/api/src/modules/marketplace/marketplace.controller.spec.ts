import { MarketplaceController } from './marketplace.controller';
import { emptyStore, type CaprovData } from '../../infrastructure/database/models';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { AuditService } from '../audit/audit.service';
import type { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import type { EthereumSepoliaMarketplaceService } from '../../infrastructure/blockchain/ethereum-sepolia-marketplace.service';
import type { AuthUser } from '../../common/types/auth-user';

const wallet = '0x0000000000000000000000000000000000000001';
const user: AuthUser = { id: 'usr_1', email: 'seller@example.com', fullName: 'Seller', organizationId: 'org_1', organizationName: 'Org', organizationSlug: 'org', roles: ['ORG_ADMIN'] };

describe('MarketplaceController on-chain listings', () => {
  it('only records a listing after the matching Sepolia event is verified', async () => {
    const store = emptyStore();
    store.assets.push({ id: 'ast_1', organizationId: 'org_1', name: 'Building', assetClass: 'REAL_ESTATE', status: 'ACTIVE', currency: 'USD', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    store.tokens.push({ id: 'tok_1', organizationId: 'org_1', assetId: 'ast_1', status: 'CONFIRMED', chainId: 11155111, chainName: 'Ethereum Sepolia', contractAddress: wallet, tokenId: '42', supply: 1000, recipientAddress: wallet, mode: 'LIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    const db = mockDb(store);
    const market = { isConfigured: jest.fn(() => true), contractAddress: jest.fn(() => wallet), verifyListingTransaction: jest.fn().mockResolvedValue(true) } as unknown as EthereumSepoliaMarketplaceService;
    const controller = new MarketplaceController(db, { log: jest.fn() } as unknown as AuditService, {} as EthereumSepoliaTokenService, market);
    const result = await controller.registerOnChainListing(user, { assetId: 'ast_1', tokenPositionId: 'tok_1', onChainListingId: '7', onChainTxHash: `0x${'a'.repeat(64)}`, listerWalletAddress: wallet, availableTokenUnits: 250, pricePerTokenWei: '1000000000000000000' });
    expect(market.verifyListingTransaction).toHaveBeenCalledWith(expect.objectContaining({ listingId: '7', assetTokenId: '42', units: '250' }));
    expect(result.onChainListingId).toBe('7');
    expect(store.listings[0]?.availableTokenUnits).toBe(250);
  });
});

function mockDb(store: CaprovData): DatabaseService {
  return { get snapshot() { return store; }, mutate<T>(fn: (draft: CaprovData) => T): T { return fn(store); } } as DatabaseService;
}
