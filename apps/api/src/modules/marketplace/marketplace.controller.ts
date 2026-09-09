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
import { getAddress, isAddress } from 'ethers';
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
import { EthereumSepoliaMarketplaceService } from '../../infrastructure/blockchain/ethereum-sepolia-marketplace.service';
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

class RegisterOnChainListingDto {
  @IsString() assetId!: string;
  @IsString() @MinLength(1) tokenPositionId!: string;
  @IsString() @MinLength(1) onChainListingId!: string;
  @IsString() @MinLength(66) onChainTxHash!: string;
  @IsString() @MinLength(42) listerWalletAddress!: string;
  @IsInt() @Min(1) availableTokenUnits!: number;
  @IsString() @MinLength(1) pricePerTokenWei!: string;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() imageUrl?: string;
}

@Controller('marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly sepolia: EthereumSepoliaTokenService,
    private readonly marketplace: EthereumSepoliaMarketplaceService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return {
      listings: this.list(user),
      openCount: this.db.snapshot.listings.filter(
        (item) =>
          item.status === 'OPEN',
      ).length,
    };
  }

  @Get('listings')
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.listings
      .map((listing) => this.hydrate(listing));
  }

  @Get('listings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const listing = this.db.snapshot.listings.find(
      (item) => item.id === id,
    );
    if (!listing) throw new NotFoundException('Listing not found');
    return this.hydrate(listing);
  }

  /** Records a listing only after the browser has escrowed units in the contract. */
  @Post('on-chain-listings')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async registerOnChainListing(@CurrentUser() user: AuthUser, @Body() dto: RegisterOnChainListingDto) {
    if (!isAddress(dto.listerWalletAddress) || !/^\d+$/.test(dto.onChainListingId) || !/^\d+$/.test(dto.pricePerTokenWei)) {
      throw new BadRequestException('Invalid wallet, listing id, or token price.');
    }
    const asset = this.db.snapshot.assets.find((item) => item.id === dto.assetId && item.organizationId === user.organizationId);
    const token = this.db.snapshot.tokens.find((item) => item.id === dto.tokenPositionId && item.assetId === dto.assetId && item.organizationId === user.organizationId && item.status === 'CONFIRMED');
    if (!asset || !token) throw new NotFoundException('A confirmed tokenized asset is required before listing.');
    if (this.db.snapshot.listings.some((item) => item.onChainListingId === dto.onChainListingId && item.marketplaceContractAddress === this.marketplace.contractAddress())) {
      throw new BadRequestException('This on-chain listing has already been registered.');
    }
    if (!this.marketplace.isConfigured()) throw new BadRequestException('The Sepolia marketplace and CAPROV payment token are not configured.');
    if (dto.availableTokenUnits > token.supply) throw new BadRequestException('Listing quantity exceeds the asset token supply.');
    const valid = await this.marketplace.verifyListingTransaction({
      txHash: dto.onChainTxHash,
      listingId: dto.onChainListingId,
      seller: dto.listerWalletAddress,
      assetTokenId: token.tokenId,
      units: String(dto.availableTokenUnits),
      pricePerTokenWei: dto.pricePerTokenWei,
    });
    if (!valid) throw new BadRequestException('The submitted transaction is not a confirmed matching Caprov marketplace listing.');
    const now = new Date().toISOString();
    const listing: MarketplaceListing = {
      id: createId('lst'), organizationId: user.organizationId, assetId: asset.id,
      title: dto.title?.trim() || `${asset.name} token units`, offeringType: 'SALE', status: 'OPEN',
      summary: dto.summary?.trim(), imageUrl: dto.imageUrl?.trim() || asset.primaryImageUrl || asset.imageUrls?.[0],
      askPrice: 0, currency: 'USD', quantityBps: 0, remainingBps: 0,
      tokenPositionId: token.id, tokenizationMode: token.mode, assetTokenId: token.tokenId,
      totalTokenSupply: token.supply, availableTokenUnits: dto.availableTokenUnits,
      pricePerTokenWei: dto.pricePerTokenWei,
      paymentTokenAddress: process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT?.trim(),
      marketplaceContractAddress: this.marketplace.contractAddress(),
      onChainListingId: dto.onChainListingId, listerWalletAddress: getAddress(dto.listerWalletAddress),
      onChainListingTxHash: dto.onChainTxHash, createdAt: now, updatedAt: now,
    };
    this.db.mutate((draft) => draft.listings.unshift(listing));
    this.audit.log({ organizationId: user.organizationId, actorUserId: user.id, action: 'marketplace.on_chain_listing_registered', entityType: 'Listing', entityId: listing.id, metadata: { onChainListingId: dto.onChainListingId, tokenId: token.tokenId } });
    return this.hydrate(listing);
  }

  /** Syncs the UI record to contract state after a buyer purchase or seller close. */
  @Post('on-chain-listings/:id/sync')
  async syncOnChainListing(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const listing = this.db.snapshot.listings.find((item) => item.id === id && item.onChainListingId);
    if (!listing) throw new NotFoundException('On-chain listing not found');
    const chain = await this.marketplace.getListing(listing.onChainListingId!);
    if (!chain) throw new BadRequestException('Marketplace contract is not configured.');
    this.db.mutate((draft) => {
      const target = draft.listings.find((item) => item.id === id);
      if (target) { target.availableTokenUnits = Number(chain.remaining); target.status = !chain.active ? 'CLOSED' : chain.remaining === '0' ? 'FILLED' : Number(chain.remaining) < (target.availableTokenUnits ?? 0) ? 'PARTIALLY_FILLED' : 'OPEN'; target.updatedAt = new Date().toISOString(); }
    });
    return this.get(user, id);
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
