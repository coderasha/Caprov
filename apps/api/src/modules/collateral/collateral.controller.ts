import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
} from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class CreateCollateralDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  tokenId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pledgedValue?: number;

  @IsOptional()
  @IsString()
  currency?: CurrencyCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  haircutBps?: number;
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

@Controller('collateral')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollateralController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.collateralPositions
      .filter((item) => item.organizationId === user.organizationId)
      .map((item) => this.hydrate(item));
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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCollateralDto) {
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

    if (dto.tokenId) {
      const token = this.db.snapshot.tokens.find(
        (item) =>
          item.id === dto.tokenId &&
          item.organizationId === user.organizationId,
      );
      if (!token) throw new NotFoundException('Token position not found');
      if (token.assetId !== asset.id) {
        throw new BadRequestException('Token does not belong to this asset');
      }
      const tokenInUse = this.db.snapshot.collateralPositions.find(
        (item) =>
          item.organizationId === user.organizationId &&
          item.tokenId === dto.tokenId &&
          item.status === 'ACTIVE',
      );
      if (tokenInUse) {
        throw new BadRequestException(
          'Token is already pledged in an active collateral position',
        );
      }
    }

    const valuation = this.db.snapshot.valuations
      .filter((item) => item.assetId === asset.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const pledgedValue = dto.pledgedValue ?? valuation?.payload.amount;
    if (!pledgedValue || pledgedValue <= 0) {
      throw new BadRequestException(
        'pledgedValue required when the asset has no valuation mark',
      );
    }
    const haircutBps = dto.haircutBps ?? 1500;
    const now = new Date().toISOString();
    const position: CollateralPosition = {
      id: createId('col'),
      organizationId: user.organizationId,
      assetId: asset.id,
      tokenId: dto.tokenId,
      status: 'PENDING_APPROVAL',
      requestedByUserId: user.id,
      pledgedValue,
      currency: dto.currency ?? valuation?.payload.currency ?? asset.currency,
      haircutBps,
      advanceableValue: this.advanceable(pledgedValue, haircutBps),
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
        advanceableValue: position.advanceableValue,
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

  @Post(':id/release')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  release(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const position = this.db.snapshot.collateralPositions.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!position) throw new NotFoundException('Collateral not found');
    if (position.status !== 'ACTIVE') {
      throw new BadRequestException('Collateral is not active');
    }
    const activeLoans = this.activeLoans(id);
    if (activeLoans.length) {
      throw new BadRequestException(
        `Cannot release collateral while ${activeLoans.length} active loan(s) remain (${activeLoans
          .map((loan) => loan.id)
          .join(', ')}). Repay loans first.`,
      );
    }
    this.db.mutate((draft) => {
      const target = draft.collateralPositions.find((item) => item.id === id)!;
      target.status = 'RELEASED';
      target.updatedAt = new Date().toISOString();
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'collateral.released',
      entityType: 'Collateral',
      entityId: id,
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
      canRelease: position.status === 'ACTIVE' && loans.length === 0,
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
      valuation:
        this.db.snapshot.valuations
          .filter((item) => item.assetId === position.assetId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    };
  }
}
