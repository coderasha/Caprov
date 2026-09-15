import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { getAddress, isAddress } from 'ethers';
import type { SettlementRecord } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { EthereumSepoliaMarketplaceService } from '../../infrastructure/blockchain/ethereum-sepolia-marketplace.service';

class CreateSettlementDto {
  @IsString()
  tradeId!: string;

  @IsOptional()
  @IsEnum(['OFF_CHAIN', 'TOKENIZED_TRANSFER'])
  method?: 'OFF_CHAIN' | 'TOKENIZED_TRANSFER';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  @MinLength(42)
  sellerWalletAddress!: string;
}
class CompleteSettlementDto { @IsString() settlementTxHash!: string; }

@Controller('settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly marketplace: EthereumSepoliaMarketplaceService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.settlements
      .filter((item) => this.isTradeParticipant(item.tradeId, user.organizationId))
      .map((item) => this.hydrate(item));
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'COMPLIANCE', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSettlementDto) {
    const trade = this.db.snapshot.trades.find(
      (item) => item.id === dto.tradeId,
    );
    if (!trade) throw new NotFoundException('Trade not found');
    if (!trade.onChainPurchaseId) {
      throw new BadRequestException('Only confirmed CAP-escrow trades can enter the Sepolia settlement flow.');
    }
    if (!this.isSellerWalletForTrade(trade.id, user.organizationId, dto.sellerWalletAddress)) {
      throw new BadRequestException('Only the listing owner can initiate settlement for this buyer order.');
    }
    if (trade.status === 'SETTLED') {
      throw new BadRequestException('Trade already settled');
    }
    const existing = this.db.snapshot.settlements.find(
      (item) => item.tradeId === trade.id,
    );
    if (existing) return this.hydrate(existing);

    const now = new Date().toISOString();
    const settlement: SettlementRecord = {
      id: createId('stl'),
      organizationId: user.organizationId,
      tradeId: trade.id,
      assetId: trade.assetId,
      status: 'PENDING',
      method: 'TOKENIZED_TRANSFER',
      notes: dto.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.settlements.unshift(settlement);
      const draftTrade = draft.trades.find((item) => item.id === trade.id);
      if (draftTrade) {
        draftTrade.status = 'SETTLING';
        draftTrade.updatedAt = now;
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'settlement.created',
      entityType: 'Settlement',
      entityId: settlement.id,
      metadata: { tradeId: trade.id },
    });
    return this.hydrate(settlement);
  }

  @Post(':id/complete')
  @Roles('ORG_ADMIN', 'ANALYST', 'COMPLIANCE', 'PLATFORM_ADMIN')
  async complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteSettlementDto) {
    const settlement = this.db.snapshot.settlements.find(
      (item) => item.id === id,
    );
    if (!settlement) throw new NotFoundException('Settlement not found');
    const trade = this.db.snapshot.trades.find((item) => item.id === settlement.tradeId);
    const listing = trade && this.db.snapshot.listings.find((item) => item.id === trade.listingId);
    if (!trade?.onChainPurchaseId || !listing?.listerWalletAddress) {
      throw new BadRequestException('This settlement is not linked to a tokenized CAP-escrow trade.');
    }
    if (!this.isSellerForTrade(settlement.tradeId, user.organizationId)) {
      throw new BadRequestException('Only the listing owner can approve settlement and release the tokenized interest.');
    }
    if (settlement.status === 'COMPLETED' || trade.status === 'SETTLED') {
      throw new BadRequestException('This trade is already settled.');
    }
    if (!await this.marketplace.verifySettlementTransaction(dto.settlementTxHash, trade.onChainPurchaseId, listing.listerWalletAddress)) {
      throw new BadRequestException('A confirmed matching Sepolia settlement transaction is required.');
    }
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const draftSettlement = draft.settlements.find((item) => item.id === id)!;
      draftSettlement.status = 'COMPLETED';
      draftSettlement.completedAt = now;
      draftSettlement.updatedAt = now;
      const draftTrade = draft.trades.find(
        (item) => item.id === draftSettlement.tradeId,
      );
      if (draftTrade) {
        draftTrade.status = 'SETTLED';
        draftTrade.settlementTxHash = dto.settlementTxHash;
        draftTrade.updatedAt = now;
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'settlement.completed',
      entityType: 'Settlement',
      entityId: id,
    });
    return this.hydrate(
      this.db.snapshot.settlements.find((item) => item.id === id)!,
    );
  }

  private hydrate(settlement: SettlementRecord) {
    const trade = this.db.snapshot.trades.find(
      (item) => item.id === settlement.tradeId,
    );
    return {
      ...settlement,
      trade: trade
        ? {
            ...trade,
            listing:
              this.db.snapshot.listings.find((item) => item.id === trade.listingId) ?? null,
          }
        : null,
      asset:
        this.db.snapshot.assets.find(
          (item) => item.id === settlement.assetId,
        ) ?? null,
    };
  }

  private isSellerForTrade(tradeId: string, organizationId: string) {
    const trade = this.db.snapshot.trades.find((item) => item.id === tradeId);
    return Boolean(
      trade && this.db.snapshot.listings.some(
        (listing) => listing.id === trade.listingId && listing.organizationId === organizationId,
      ),
    );
  }

  private isSellerWalletForTrade(tradeId: string, organizationId: string, walletAddress: string) {
    if (!isAddress(walletAddress)) return false;
    const trade = this.db.snapshot.trades.find((item) => item.id === tradeId);
    const listing = trade && this.db.snapshot.listings.find((item) => item.id === trade.listingId);
    return Boolean(
      listing &&
        listing.organizationId === organizationId &&
        listing.listerWalletAddress &&
        getAddress(listing.listerWalletAddress) === getAddress(walletAddress),
    );
  }

  private isTradeParticipant(tradeId: string, organizationId: string) {
    const trade = this.db.snapshot.trades.find((item) => item.id === tradeId);
    return Boolean(trade && (trade.organizationId === organizationId || this.isSellerForTrade(tradeId, organizationId)));
  }
}
