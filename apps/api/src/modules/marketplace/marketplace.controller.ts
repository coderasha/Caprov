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
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import type { CurrencyCode, MarketplaceListing } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
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
}

@Controller('marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return {
      listings: this.list(user),
      openCount: this.db.snapshot.listings.filter(
        (item) => item.organizationId === user.organizationId && item.status === 'OPEN',
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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateListingDto) {
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) throw new NotFoundException('Asset not found');
    const valuation = this.db.snapshot.valuations
      .filter((item) => item.assetId === asset.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const now = new Date().toISOString();
    const quantityBps = dto.quantityBps ?? 10_000;
    const listing: MarketplaceListing = {
      id: createId('lst'),
      organizationId: user.organizationId,
      assetId: asset.id,
      title: dto.title ?? `${asset.name} interest`,
      status: 'OPEN',
      askPrice: dto.askPrice ?? valuation?.payload.amount ?? 0,
      currency: dto.currency ?? valuation?.payload.currency ?? asset.currency,
      quantityBps,
      remainingBps: quantityBps,
      createdAt: now,
      updatedAt: now,
    };
    if (!listing.askPrice) {
      throw new BadRequestException('Ask price required when asset has no valuation mark');
    }
    this.db.mutate((draft) => {
      draft.listings.unshift(listing);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'marketplace.listing_created',
      entityType: 'Listing',
      entityId: listing.id,
      metadata: { assetId: asset.id, askPrice: listing.askPrice },
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
    const asset = this.db.snapshot.assets.find((item) => item.id === listing.assetId) ?? null;
    const valuation =
      this.db.snapshot.valuations
        .filter((item) => item.assetId === listing.assetId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const risk =
      this.db.snapshot.risks
        .filter((item) => item.assetId === listing.assetId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return { ...listing, asset, valuation, risk };
  }
}
