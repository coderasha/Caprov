import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type {
  CollateralPosition,
  CurrencyCode,
  LoanFacility,
  TokenPosition,
} from '@caprov/types';
import { formatUnits } from 'ethers';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { EthereumSepoliaCollateralVaultService } from '../../infrastructure/blockchain/ethereum-sepolia-collateral-vault.service';

class CreateCollateralDto {
  @IsString()
  assetId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  collateralBps!: number;

  @IsString()
  tokenId!: string;

  @IsString()
  vaultCollateralId!: string;

  @IsString()
  vaultTxHash!: string;

  @IsString()
  borrowerWalletAddress!: string;
}

class UpdateCollateralDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pledgedValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  haircutBps?: number;
}

type CollateralMarketValuation = {
  assetId: string;
  tokenPositionId: string;
  pricePerTokenUsd: number;
  assetValueUsd: number;
  source: 'SETTLED_CAP_VWAP' | 'TOKENIZED_LISTING_PRICE';
  sourceLabel: string;
  settledTradeCount: number;
  observedAt: string;
};

@Controller('collateral')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollateralController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly vault: EthereumSepoliaCollateralVaultService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    const isBanker = user.roles.includes('BANKER');
    const isPlatformAdmin = user.roles.includes('PLATFORM_ADMIN');
    return this.db.snapshot.collateralPositions
      .filter((item) => {
        if (item.organizationId === user.organizationId || isPlatformAdmin) {
          return true;
        }
        // Bankers receive a review inbox of live borrower collateral only.
        // Released and historical positions remain visible only to the owner
        // organization or a platform administrator.
        return (
          isBanker &&
          (item.status === 'PENDING_APPROVAL' || item.status === 'ACTIVE')
        );
      })
      .map((item) => this.hydrate(item));
  }

  @Get('valuation/:assetId')
  marketValuation(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Query('tokenId') tokenId?: string,
  ) {
    const token = this.db.snapshot.tokens.find(
      (item) =>
        item.id === tokenId &&
        item.assetId === assetId &&
        item.organizationId === user.organizationId &&
        item.status === 'CONFIRMED',
    );
    if (!token) {
      throw new NotFoundException(
        'A confirmed token position for this asset is required.',
      );
    }
    const valuation = this.getCollateralMarketValuation(assetId, token);
    if (!valuation) {
      throw new BadRequestException(
        'Collateral requires an on-chain tokenized listing price or a completed CAP settlement for this token position.',
      );
    }
    return valuation;
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const position = this.db.snapshot.collateralPositions.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!position) throw new NotFoundException('Collateral not found');
    return this.hydrate(position);
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCollateralDto) {
    const asset = this.db.snapshot.assets.find(
      (item) =>
        item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) throw new NotFoundException('Asset not found');

    const existingActive = this.db.snapshot.collateralPositions.find(
      (item) =>
        item.organizationId === user.organizationId &&
        item.assetId === asset.id &&
        item.status === 'ACTIVE',
    );
    if (existingActive) {
      throw new BadRequestException(
        `Asset already has an active collateral position (${existingActive.id}). Release it before pledging again.`,
      );
    }

    const token = this.db.snapshot.tokens.find((item) => item.id === dto.tokenId && item.organizationId === user.organizationId && item.status === 'CONFIRMED');
    if (!token || token.assetId !== asset.id) throw new NotFoundException('A confirmed token position for this asset is required.');
    const existingBps = this.db.snapshot.collateralPositions
      .filter((item) => item.assetId === asset.id && item.tokenId === token.id && ['ACTIVE', 'PENDING_APPROVAL'].includes(item.status))
      .reduce((sum, item) => sum + (item.collateralBps ?? 10_000), 0);
    if (existingBps + dto.collateralBps > 10_000) throw new BadRequestException('This request exceeds the unpledged portion of the asset token supply.');
    const lockedTokenUnits = Math.floor((token.supply * dto.collateralBps) / 10_000);
    if (lockedTokenUnits < 1) throw new BadRequestException('The selected percentage produces fewer than one ERC-1155 unit.');
    if (!this.vault.isConfigured()) throw new BadRequestException('The live Sepolia collateral vault is not configured.');
    if (!token.contractAddress) throw new BadRequestException('The ERC-1155 contract address is missing from this token position.');
    if (token.recipientAddress.toLowerCase() !== dto.borrowerWalletAddress.toLowerCase()) {
      throw new BadRequestException('Collateral must be locked from the wallet that received this ERC-1155 token position.');
    }
    const validLock = await this.vault.verifyLock({
      txHash: dto.vaultTxHash, collateralId: dto.vaultCollateralId,
      borrower: dto.borrowerWalletAddress, assetToken: token.contractAddress,
      tokenId: token.tokenId, units: lockedTokenUnits,
    });
    if (!validLock) throw new BadRequestException('The submitted transaction is not a confirmed matching Sepolia collateral lock.');

    const marketValuation = this.getCollateralMarketValuation(asset.id, token);
    const pledgedValue = marketValuation
      ? Number((marketValuation.pricePerTokenUsd * lockedTokenUnits).toFixed(2))
      : undefined;
    if (!pledgedValue || pledgedValue <= 0) {
      throw new BadRequestException(
        'Collateral requires an on-chain tokenized listing price or a completed CAP settlement for this token position.',
      );
    }
    const now = new Date().toISOString();
    const position: CollateralPosition = {
      id: createId('col'),
      organizationId: user.organizationId,
      assetId: asset.id,
      tokenId: token.id,
      collateralBps: dto.collateralBps,
      totalTokenSupply: token.supply,
      lockedTokenUnits,
      vaultCollateralId: dto.vaultCollateralId,
      vaultTxHash: dto.vaultTxHash,
      status: 'PENDING_APPROVAL',
      requestedByUserId: user.id,
      pledgedValue,
      currency: 'USD',
      // Banker underwriting applies the haircut later. The lister only states
      // the portion of the asset offered as collateral.
      haircutBps: 0,
      advanceableValue: pledgedValue,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.collateralPositions.unshift(position);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'collateral.pledged',
      entityType: 'Collateral',
      entityId: position.id,
      metadata: {
        assetId: asset.id,
        tokenId: dto.tokenId,
        vaultCollateralId: dto.vaultCollateralId,
        vaultTxHash: dto.vaultTxHash,
        advanceableValue: position.advanceableValue,
        valuationSource: marketValuation?.source,
        pricePerTokenUsd: marketValuation?.pricePerTokenUsd,
      },
    });
    return this.hydrate(position);
  }

  @Post(':id/approve')
  @Roles('COMPLIANCE', 'ORG_ADMIN', 'PLATFORM_ADMIN')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const position = this.db.snapshot.collateralPositions.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!position) throw new NotFoundException('Collateral not found');
    if (position.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Collateral is not pending approval');
    }

    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.collateralPositions.find((item) => item.id === id)!;
      target.status = 'ACTIVE';
      target.approvedAt = now;
      target.approvedByUserId = user.id;
      target.updatedAt = now;
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'collateral.approved',
      entityType: 'Collateral',
      entityId: id,
    });
    return this.hydrate(
      this.db.snapshot.collateralPositions.find((item) => item.id === id)!,
    );
  }

  @Patch(':id')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCollateralDto,
  ) {
    const position = this.db.snapshot.collateralPositions.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!position) throw new NotFoundException('Collateral not found');
    if (!['PENDING_APPROVAL', 'ACTIVE'].includes(position.status)) {
      throw new BadRequestException(
        'Only pending or active collateral can be updated',
      );
    }
    if (dto.pledgedValue == null && dto.haircutBps == null) {
      throw new BadRequestException('Provide pledgedValue and/or haircutBps');
    }

    const nextPledged = dto.pledgedValue ?? position.pledgedValue;
    const nextHaircut = dto.haircutBps ?? position.haircutBps;
    const nextAdvanceable = this.advanceable(nextPledged, nextHaircut);
    const utilized = this.utilizedAmount(id);
    if (nextAdvanceable < utilized) {
      throw new BadRequestException(
        `Advanceable value ${nextAdvanceable} would fall below outstanding loans ${utilized}`,
      );
    }

    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.collateralPositions.find((item) => item.id === id)!;
      target.pledgedValue = nextPledged;
      target.haircutBps = nextHaircut;
      target.advanceableValue = nextAdvanceable;
      target.updatedAt = now;
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'collateral.updated',
      entityType: 'Collateral',
      entityId: id,
      metadata: { pledgedValue: nextPledged, haircutBps: nextHaircut },
    });
    return this.hydrate(
      this.db.snapshot.collateralPositions.find((item) => item.id === id)!,
    );
  }

  private advanceable(pledgedValue: number, haircutBps: number): number {
    return Number((pledgedValue * (1 - haircutBps / 10_000)).toFixed(2));
  }

  private activeLoans(collateralId: string): LoanFacility[] {
    return this.db.snapshot.loans.filter(
      (item) => item.collateralId === collateralId && item.status === 'ACTIVE',
    );
  }

  private utilizedAmount(collateralId: string): number {
    return this.activeLoans(collateralId).reduce(
      (sum, loan) => sum + loan.outstanding,
      0,
    );
  }

  private hydrate(position: CollateralPosition) {
    const loans = this.activeLoans(position.id);
    const utilizedAmount = loans.reduce(
      (sum, loan) => sum + loan.outstanding,
      0,
    );
    const availableAmount = Number(
      Math.max(0, position.advanceableValue - utilizedAmount).toFixed(2),
    );
    return {
      ...position,
      utilizedAmount,
      availableAmount,
      // An ERC-1155 lock is released only by the lender after a verified
      // Sepolia release transaction.  The asset owner cannot change this
      // local state unilaterally.
      canRelease: false,
      activeLoanCount: loans.length,
      loans,
      asset:
        this.db.snapshot.assets.find((item) => item.id === position.assetId) ??
        null,
      token: position.tokenId
        ? (this.db.snapshot.tokens.find(
            (item) => item.id === position.tokenId,
          ) ?? null)
        : null,
      marketValuation: position.tokenId
        ? this.getCollateralMarketValuation(
            position.assetId,
            this.db.snapshot.tokens.find((item) => item.id === position.tokenId),
          )
        : null,
    };
  }

  private getCollateralMarketValuation(
    assetId: string,
    token?: TokenPosition,
  ): CollateralMarketValuation | null {
    if (!token || token.supply < 1) return null;

    const settledTrades = this.db.snapshot.trades.filter((trade) => {
      if (
        trade.assetId !== assetId ||
        trade.status !== 'SETTLED' ||
        !trade.tokenUnits ||
        trade.tokenUnits < 1 ||
        trade.notional <= 0 ||
        trade.currency !== 'USD'
      ) {
        return false;
      }
      const listing = this.db.snapshot.listings.find(
        (item) => item.id === trade.listingId,
      );
      return listing?.tokenPositionId === token.id;
    });
    const settledUnits = settledTrades.reduce(
      (total, trade) => total + (trade.tokenUnits ?? 0),
      0,
    );
    const settledNotional = settledTrades.reduce(
      (total, trade) => total + trade.notional,
      0,
    );
    if (settledUnits > 0 && settledNotional > 0) {
      const pricePerTokenUsd = Number(
        (settledNotional / settledUnits).toFixed(8),
      );
      return {
        assetId,
        tokenPositionId: token.id,
        pricePerTokenUsd,
        assetValueUsd: Number((pricePerTokenUsd * token.supply).toFixed(2)),
        source: 'SETTLED_CAP_VWAP',
        sourceLabel: `VWAP of ${settledTrades.length} settled CAP trade${settledTrades.length === 1 ? '' : 's'}`,
        settledTradeCount: settledTrades.length,
        observedAt: settledTrades
          .map((trade) => trade.updatedAt)
          .sort()
          .at(-1)!,
      };
    }

    const issuanceListing = this.db.snapshot.listings
      .filter(
        (listing) =>
          listing.assetId === assetId &&
          listing.tokenPositionId === token.id &&
          Boolean(listing.onChainListingId) &&
          Boolean(listing.pricePerTokenWei),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!issuanceListing?.pricePerTokenWei) return null;

    let pricePerTokenUsd: number;
    try {
      pricePerTokenUsd = Number(
        formatUnits(BigInt(issuanceListing.pricePerTokenWei), 18),
      );
    } catch {
      return null;
    }
    if (!Number.isFinite(pricePerTokenUsd) || pricePerTokenUsd <= 0) {
      return null;
    }
    return {
      assetId,
      tokenPositionId: token.id,
      pricePerTokenUsd,
      assetValueUsd: Number((pricePerTokenUsd * token.supply).toFixed(2)),
      source: 'TOKENIZED_LISTING_PRICE',
      sourceLabel: 'Initial on-chain tokenized listing price',
      settledTradeCount: 0,
      observedAt: issuanceListing.createdAt,
    };
  }
}
