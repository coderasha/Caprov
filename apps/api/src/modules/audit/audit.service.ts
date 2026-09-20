import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import type { AuditEventRecord } from '../../infrastructure/database/models';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  log(input: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): AuditEventRecord {
    const event: AuditEventRecord = {
      id: createId('aud'),
      createdAt: new Date().toISOString(),
      ...input,
    };
    return this.db.mutate((draft) => {
      draft.auditEvents.unshift(event);
      return event;
    });
  }

  list(
    organizationId: string,
    limit = 100,
    includeAll = false,
  ): AuditEventRecord[] {
    return this.db.snapshot.auditEvents
      .filter((event) => includeAll || event.organizationId === organizationId)
      .slice(0, limit);
  }

  /**
   * Returns the complete activity trail for an asset, including actions whose
   * audit entity is a document, token, collateral position, facility, listing,
   * order, trade, or settlement related to that asset.
   */
  listForAsset(
    organizationId: string,
    assetId: string,
    includeAll = false,
  ) {
    return this.db.snapshot.auditEvents
      .filter(
        (event) =>
          (includeAll || event.organizationId === organizationId) &&
          this.assetIdForEvent(event) === assetId,
      )
      .map((event) => {
        const transactionHash = this.transactionHashForEvent(event);
        return {
          ...event,
          explorerUrl: transactionHash
            ? `https://sepolia.etherscan.io/tx/${transactionHash}`
            : undefined,
        };
      });
  }

  private assetIdForEvent(event: AuditEventRecord): string | undefined {
    if (event.entityType === 'Asset') return event.entityId;

    const metadata = event.metadata ?? {};
    if (typeof metadata.assetId === 'string') return metadata.assetId;

    const relatedIds = [
      event.entityId,
      ...['documentId', 'tokenId', 'collateralId', 'loanId', 'listingId', 'orderId', 'tradeId', 'settlementId']
        .map((key) => metadata[key])
        .filter((value): value is string => typeof value === 'string'),
    ];

    for (const id of relatedIds) {
      const document = this.db.snapshot.documents.find((item) => item.id === id);
      if (document) return document.assetId;
      const token = this.db.snapshot.tokens.find((item) => item.id === id);
      if (token) return token.assetId;
      const collateral = this.db.snapshot.collateralPositions.find((item) => item.id === id);
      if (collateral) return collateral.assetId;
      const loan = this.db.snapshot.loans.find((item) => item.id === id);
      if (loan) return loan.assetId;
      const listing = this.db.snapshot.listings.find((item) => item.id === id);
      if (listing) return listing.assetId;
      const order = this.db.snapshot.orders.find((item) => item.id === id);
      if (order) return order.assetId;
      const trade = this.db.snapshot.trades.find((item) => item.id === id);
      if (trade) return trade.assetId;
      const settlement = this.db.snapshot.settlements.find((item) => item.id === id);
      if (settlement) return settlement.assetId;
    }
    return undefined;
  }

  private transactionHashForEvent(event: AuditEventRecord): string | undefined {
    const metadata = event.metadata ?? {};
    for (const key of ['transactionHash', 'txHash', 'vaultTxHash', 'vaultActivationTxHash', 'purchaseTxHash', 'settlementTxHash']) {
      const value = metadata[key];
      if (typeof value === 'string' && value.startsWith('0x')) return value;
    }

    const id = event.entityId;
    if (!id) return undefined;
    const token = this.db.snapshot.tokens.find((item) => item.id === id);
    if (token?.txHash) return token.txHash;
    const collateral = this.db.snapshot.collateralPositions.find((item) => item.id === id);
    if (collateral?.vaultTxHash) return collateral.vaultTxHash;
    const loan = this.db.snapshot.loans.find((item) => item.id === id);
    if (loan?.vaultActivationTxHash) return loan.vaultActivationTxHash;
    const listing = this.db.snapshot.listings.find((item) => item.id === id);
    if (listing?.onChainListingTxHash || listing?.onChainCloseTxHash) {
      return listing.onChainCloseTxHash ?? listing.onChainListingTxHash;
    }
    const trade = this.db.snapshot.trades.find((item) => item.id === id);
    if (trade?.settlementTxHash || trade?.purchaseTxHash) {
      return trade.settlementTxHash ?? trade.purchaseTxHash;
    }
    const settlement = this.db.snapshot.settlements.find((item) => item.id === id);
    if (settlement) {
      const settlementTrade = this.db.snapshot.trades.find((item) => item.id === settlement.tradeId);
      return settlementTrade?.settlementTxHash ?? settlementTrade?.purchaseTxHash;
    }
    return undefined;
  }
}
