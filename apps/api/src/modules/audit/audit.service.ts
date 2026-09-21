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
    const recordedEvents = this.db.snapshot.auditEvents
      .filter(
        (event) =>
          (includeAll || event.organizationId === organizationId) &&
          this.assetIdForEvent(event) === assetId,
      );
    const historicalEvents = this.backfillAssetHistory(assetId, recordedEvents)
      .filter((event) => includeAll || event.organizationId === organizationId);

    return [...recordedEvents, ...historicalEvents]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((event) => {
        const transactionHash = this.transactionHashForEvent(event);
        const configuredExplorerUrl = event.metadata?.explorerUrl;
        return {
          ...event,
          explorerUrl: typeof configuredExplorerUrl === 'string'
            ? configuredExplorerUrl
            : transactionHash
            ? `https://sepolia.etherscan.io/tx/${transactionHash}`
            : undefined,
        };
      });
  }

  /**
   * Older records predate the asset audit view. Reconstruct their known
   * lifecycle events in memory so the first visit has a useful history. This
   * deliberately does not write synthetic events back to the audit ledger.
   */
  private backfillAssetHistory(assetId: string, recordedEvents: AuditEventRecord[]) {
    const asset = this.db.snapshot.assets.find((item) => item.id === assetId);
    if (!asset) return [];

    const existing = new Set(
      recordedEvents.map((event) => `${event.action}:${event.entityType}:${event.entityId ?? ''}`),
    );
    const events: AuditEventRecord[] = [];
    const add = (
      action: string,
      entityType: string,
      entityId: string,
      createdAt: string | undefined,
      metadata?: Record<string, unknown>,
    ) => {
      if (!createdAt || existing.has(`${action}:${entityType}:${entityId}`)) return;
      events.push({
        id: `history_${action}_${entityId}`.replaceAll('.', '_'),
        organizationId: asset.organizationId,
        action,
        entityType,
        entityId,
        metadata: { ...metadata, backfilled: true },
        createdAt,
      });
    };

    add('asset.created', 'Asset', asset.id, asset.createdAt);

    for (const document of this.db.snapshot.documents.filter((item) => item.assetId === assetId)) {
      add('document.uploaded', 'Document', document.id, document.createdAt, {
        documentName: document.name,
        documentType: document.type,
      });
      if (document.anchorTxHash || document.anchorExplorerUrl) {
        add('document.anchor.recorded', 'Document', document.id, document.anchoredAt ?? document.createdAt, {
          transactionHash: document.anchorTxHash,
          explorerUrl: document.anchorExplorerUrl,
        });
      }
    }

    for (const token of this.db.snapshot.tokens.filter((item) => item.assetId === assetId)) {
      add('tokenization.minted', 'Token', token.id, token.createdAt, {
        transactionHash: token.txHash,
        explorerUrl: token.explorerUrl,
        assetId,
      });
    }

    for (const position of this.db.snapshot.collateralPositions.filter((item) => item.assetId === assetId)) {
      add('collateral.pledged', 'Collateral', position.id, position.createdAt, {
        transactionHash: position.vaultTxHash,
        assetId,
      });
      add('collateral.approved', 'Collateral', position.id, position.approvedAt);
      if (position.status === 'RELEASED') {
        add('lending.collateral_released_after_repayment', 'Collateral', position.id, position.updatedAt, {
          transactionHash: position.vaultTxHash,
          assetId,
        });
      }
    }

    for (const loan of this.db.snapshot.loans.filter((item) => item.assetId === assetId)) {
      add('lending.loan_opened', 'Loan', loan.id, loan.createdAt, { assetId });
      add('lending.loan_disbursed', 'Loan', loan.id, loan.disbursedAt, {
        transactionHash: loan.vaultActivationTxHash,
        assetId,
      });
      add('lending.loan_repaid', 'Loan', loan.id, loan.repaidAt, { assetId });
    }

    for (const listing of this.db.snapshot.listings.filter((item) => item.assetId === assetId)) {
      add('marketplace.listing_created', 'Listing', listing.id, listing.createdAt, { assetId });
      if (listing.onChainListingId || listing.onChainListingTxHash) {
        add('marketplace.on_chain_listing_registered', 'Listing', listing.id, listing.createdAt, {
          transactionHash: listing.onChainListingTxHash,
          assetId,
        });
      }
      add('marketplace.listing_closed', 'Listing', listing.id, listing.closedAt, {
        transactionHash: listing.onChainCloseTxHash,
        assetId,
      });
    }

    for (const order of this.db.snapshot.orders.filter((item) => item.assetId === assetId)) {
      add('trading.order_created', 'Order', order.id, order.createdAt, { assetId });
    }
    for (const trade of this.db.snapshot.trades.filter((item) => item.assetId === assetId)) {
      add('trading.trade_matched', 'Trade', trade.id, trade.createdAt, {
        transactionHash: trade.purchaseTxHash,
        assetId,
      });
    }
    for (const settlement of this.db.snapshot.settlements.filter((item) => item.assetId === assetId)) {
      add('settlement.created', 'Settlement', settlement.id, settlement.createdAt, { assetId });
      add('settlement.completed', 'Settlement', settlement.id, settlement.completedAt, { assetId });
    }
    return events;
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
