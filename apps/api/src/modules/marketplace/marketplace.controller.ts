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
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type {
  CurrencyCode,
  MarketplaceListing,
  TokenPosition,
} from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class CreateListingDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsEnum(['SALE', 'LEASE'])
  offeringType?: 'SALE' | 'LEASE';

  @IsOptional()
  @IsString()
  @MinLength(2)
  summary?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  askPrice?: number;

  @IsOptional()
  @IsString()
  currency?: CurrencyCode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantityBps?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  leaseRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  leaseTermMonths?: number;

  @IsOptional()
  @IsBoolean()
  tokenizeOnCreate?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  tokenSupply?: number;

  @IsOptional()
  @IsString()
  @MinLength(42)
  recipientAddress?: string;
}

@Controller('marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly sepolia: EthereumSepoliaTokenService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return {
      listings: this.list(user),
      openCount: this.db.snapshot.listings.filter(
        (item) =>
          item.organizationId === user.organizationId && item.status === 'OPEN',
      ).length,
    };
  }

  @Get('listings')
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.listings
      .filter((item) => item.organizationId === user.organizationId)
      .map((listing) => this.hydrate(listing));
  }

  @Get('listings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const listing = this.db.snapshot.listings.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!listing) throw new NotFoundException('Listing not found');
    return this.hydrate(listing);
  }

  @Post('listings')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateListingDto) {
    const asset = this.db.snapshot.assets.find(
      (item) =>
        item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) throw new NotFoundException('Asset not found');
    const valuation = this.db.snapshot.valuations
      .filter((item) => item.assetId === asset.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const now = new Date().toISOString();
    const offeringType = dto.offeringType ?? 'SALE';
    const quantityBps =
      offeringType === 'LEASE' ? 10_000 : (dto.quantityBps ?? 10_000);
    let token: TokenPosition | null =
      this.db.snapshot.tokens
        .filter((item) => item.assetId === asset.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    let mintedToken: TokenPosition | null = null;

    if (dto.tokenizeOnCreate) {
      if (token) {
        throw new BadRequestException(
          'This asset has already been tokenized. Re-list its existing token units through the on-chain marketplace; a second supply cannot be minted.',
        );
      }
      const network = this.sepolia.getNetworkStatus();
      if (!network.liveMintReady) {
        throw new BadRequestException(
          'Live Ethereum Sepolia tokenization is not configured. Set ETHEREUM_SEPOLIA_PRIVATE_KEY (or ETHEREUM_SEPOLIA_MNEMONIC) and ETHEREUM_TOKEN_CONTRACT before publishing a tokenized listing.',
        );
      }
      const pendingId = createId('tok');
      const mint = await this.sepolia.mintAssetToken({
        assetId: asset.id,
        tokenId: pendingId,
        supply: dto.tokenSupply ?? 1_000_000,
        recipientAddress: dto.recipientAddress,
      });
      if (mint.status !== 'CONFIRMED' || mint.mode !== 'LIVE') {
        throw new BadRequestException(
          `Live Ethereum Sepolia mint failed. The listing was not published.${mint.error ? ` ${mint.error}` : ''}`,
        );
      }
      mintedToken = {
        id: pendingId,
        organizationId: user.organizationId,
        assetId: asset.id,
        status: 'CONFIRMED',
        chainId: mint.chainId,
        chainName: mint.chainName,
        contractAddress: mint.contractAddress,
        tokenId: mint.tokenId,
        supply: mint.supply,
        recipientAddress: mint.recipientAddress,
        txHash: mint.txHash,
        explorerUrl: mint.explorerUrl,
        mode: mint.mode,
        createdAt: now,
        updatedAt: now,
      };
      token = mintedToken;
    }

    const askPrice =
      offeringType === 'LEASE'
        ? (dto.leaseRate ?? dto.askPrice ?? 0)
        : (dto.askPrice ?? valuation?.payload.amount ?? 0);
    const listing: MarketplaceListing = {
      id: createId('lst'),
      organizationId: user.organizationId,
      assetId: asset.id,
      title:
        dto.title ??
        `${asset.name} ${offeringType === 'LEASE' ? 'lease' : 'interest'}`,
      offeringType,
      status: 'OPEN',
      summary: dto.summary?.trim(),
      imageUrl:
        dto.imageUrl?.trim() || asset.primaryImageUrl || asset.imageUrls?.[0],
      askPrice,
      currency: dto.currency ?? valuation?.payload.currency ?? asset.currency,
      leaseRate:
        offeringType === 'LEASE' ? (dto.leaseRate ?? dto.askPrice) : undefined,
      leaseTermMonths:
        offeringType === 'LEASE' ? dto.leaseTermMonths : undefined,
      tokenPositionId: token?.id,
      tokenizationMode: token?.mode,
      quantityBps,
      remainingBps: quantityBps,
      createdAt: now,
      updatedAt: now,
    };
    if (offeringType === 'SALE' && !listing.askPrice) {
      throw new BadRequestException(
        'Ask price required when asset has no valuation mark',
      );
    }
    if (offeringType === 'LEASE' && !listing.leaseRate) {
      throw new BadRequestException(
        'Lease rate is required for lease listings',
      );
    }
    this.db.mutate((draft) => {
      if (mintedToken) {
        draft.tokens.unshift(mintedToken);
      }
      draft.listings.unshift(listing);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'marketplace.listing_created',
      entityType: 'Listing',
      entityId: listing.id,
      metadata: {
        assetId: asset.id,
        askPrice: listing.askPrice,
        offeringType: listing.offeringType,
        tokenPositionId: token?.id,
      },
    });
    return this.hydrate(listing);
  }

  @Post('listings/:id/close')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const listing = this.db.snapshot.listings.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!listing) throw new NotFoundException('Listing not found');
    this.db.mutate((draft) => {
      const target = draft.listings.find((item) => item.id === id);
      if (target) {
        target.status = 'CLOSED';
        target.updatedAt = new Date().toISOString();
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'marketplace.listing_closed',
      entityType: 'Listing',
      entityId: id,
    });
    return this.get(user, id);
  }

  private hydrate(listing: MarketplaceListing) {
    const asset =
      this.db.snapshot.assets.find((item) => item.id === listing.assetId) ??
      null;
    const valuation =
      this.db.snapshot.valuations
        .filter((item) => item.assetId === listing.assetId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const risk =
      this.db.snapshot.risks
        .filter((item) => item.assetId === listing.assetId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const token =
      this.db.snapshot.tokens.find(
        (item) => item.id === listing.tokenPositionId,
      ) ??
      this.db.snapshot.tokens
        .filter((item) => item.assetId === listing.assetId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null;
    return { ...listing, asset, valuation, risk, token };
  }
}
