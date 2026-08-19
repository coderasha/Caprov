import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { CurrencyCode } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class CreatePortfolioDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['USD', 'EUR', 'GBP', 'INR', 'SGD'])
  baseCurrency?: CurrencyCode;
}

class AddHoldingDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('portfolios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortfoliosController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.portfolios
      .filter((item) => item.organizationId === user.organizationId)
      .map((portfolio) => this.hydrate(portfolio.id));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const portfolio = this.hydrate(id);
    if (!portfolio || portfolio.organizationId !== user.organizationId) {
      return null;
    }
    return portfolio;
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePortfolioDto) {
    const now = new Date().toISOString();
    const portfolio = {
      id: createId('ptf'),
      organizationId: user.organizationId,
      name: dto.name,
      description: dto.description,
      baseCurrency: dto.baseCurrency ?? 'USD',
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.portfolios.unshift(portfolio);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'portfolio.created',
      entityType: 'Portfolio',
      entityId: portfolio.id,
    });
    return this.hydrate(portfolio.id);
  }

  @Post(':id/holdings')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  addHolding(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddHoldingDto,
  ) {
    const portfolio = this.db.snapshot.portfolios.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!portfolio) {
      return null;
    }
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) {
      return null;
    }
    const requestedWeight =
      dto.weight == null ? this.defaultWeightForNewHolding(id) : clampWeight(dto.weight);
    const holding = {
      id: createId('hld'),
      portfolioId: id,
      assetId: dto.assetId,
      weight: requestedWeight,
      notes: dto.notes,
    };
    this.db.mutate((draft) => {
      if (draft.holdings.some((item) => item.portfolioId === id && item.assetId === dto.assetId)) {
        return;
      }
      const portfolioHoldings = draft.holdings.filter((item) => item.portfolioId === id);
      const rebalancedExisting = rebalanceExistingWeights(portfolioHoldings, requestedWeight);
      for (const existing of portfolioHoldings) {
        const nextWeight = rebalancedExisting.get(existing.id);
        if (nextWeight != null) {
          existing.weight = nextWeight;
        }
      }
      draft.holdings.push(holding);
      const targetPortfolio = draft.portfolios.find((item) => item.id === id);
      if (targetPortfolio) {
        targetPortfolio.updatedAt = new Date().toISOString();
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'portfolio.holding_added',
      entityType: 'Portfolio',
      entityId: id,
      metadata: { assetId: dto.assetId, weight: requestedWeight, rebalanced: true },
    });
    return this.hydrate(id);
  }

  @Delete(':id/holdings/:holdingId')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  removeHolding(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('holdingId') holdingId: string,
  ) {
    this.db.mutate((draft) => {
      const portfolioHoldings = draft.holdings.filter((item) => item.portfolioId === id);
      const remaining = portfolioHoldings.filter((item) => item.id !== holdingId);
      const rebalanced = rebalanceRemainingWeightsAfterRemoval(remaining);
      draft.holdings = draft.holdings.filter(
        (item) => !(item.id === holdingId && item.portfolioId === id),
      );
      for (const item of draft.holdings) {
        if (item.portfolioId !== id) {
          continue;
        }
        const nextWeight = rebalanced.get(item.id);
        if (nextWeight != null) {
          item.weight = nextWeight;
        }
      }
      const targetPortfolio = draft.portfolios.find((item) => item.id === id);
      if (targetPortfolio) {
        targetPortfolio.updatedAt = new Date().toISOString();
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'portfolio.holding_removed',
      entityType: 'Portfolio',
      entityId: id,
      metadata: { holdingId, rebalanced: true },
    });
    return this.hydrate(id);
  }

  private hydrate(portfolioId: string) {
    const portfolio = this.db.snapshot.portfolios.find((item) => item.id === portfolioId);
    if (!portfolio) {
      return null;
    }
    const rawHoldings = this.db.snapshot.holdings
      .filter((item) => item.portfolioId === portfolioId)
      .map((holding) => ({
        ...holding,
        asset: this.db.snapshot.assets.find((asset) => asset.id === holding.assetId) ?? null,
        valuation:
          this.db.snapshot.valuations
            .filter((item) => item.assetId === holding.assetId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
        risk:
          this.db.snapshot.risks
            .filter((item) => item.assetId === holding.assetId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
      }));
    const normalizedWeights = rebalanceRemainingWeightsAfterRemoval(rawHoldings);
    const holdings = rawHoldings.map((holding) => ({
      ...holding,
      weight: normalizedWeights.get(holding.id) ?? holding.weight,
    }));
    return { ...portfolio, holdings, holdingCount: holdings.length };
  }

  private defaultWeightForNewHolding(portfolioId: string) {
    const holdings = this.db.snapshot.holdings.filter((item) => item.portfolioId === portfolioId);
    return roundWeight(100 / (holdings.length + 1));
  }
}

function rebalanceExistingWeights(
  holdings: Array<{ id: string; weight?: number }>,
  newHoldingWeight: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!holdings.length) {
    return result;
  }

  const remainingWeight = clampWeight(100 - newHoldingWeight);
  if (remainingWeight === 0) {
    for (const holding of holdings) {
      result.set(holding.id, 0);
    }
    return result;
  }

  const normalized = normalizeExistingWeights(holdings);
  const total = normalized.reduce((sum, holding) => sum + holding.weight, 0);
  let allocated = 0;

  normalized.forEach((holding, index) => {
    const isLast = index === normalized.length - 1;
    const nextWeight = isLast
      ? roundWeight(remainingWeight - allocated)
      : roundWeight((holding.weight / total) * remainingWeight);
    allocated += nextWeight;
    result.set(holding.id, nextWeight);
  });

  return result;
}

function rebalanceRemainingWeightsAfterRemoval(
  holdings: Array<{ id: string; weight?: number }>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!holdings.length) {
    return result;
  }

  const normalized = normalizeExistingWeights(holdings);
  const total = normalized.reduce((sum, holding) => sum + holding.weight, 0);
  let allocated = 0;

  normalized.forEach((holding, index) => {
    const isLast = index === normalized.length - 1;
    const nextWeight = isLast
      ? roundWeight(100 - allocated)
      : roundWeight((holding.weight / total) * 100);
    allocated += nextWeight;
    result.set(holding.id, nextWeight);
  });

  return result;
}

function normalizeExistingWeights(holdings: Array<{ id: string; weight?: number }>) {
  const validWeights = holdings.map((holding) => clampWeight(holding.weight ?? 0));
  const total = validWeights.reduce((sum, weight) => sum + weight, 0);
  if (total > 0) {
    return holdings.map((holding, index) => ({ id: holding.id, weight: validWeights[index]! }));
  }

  const equalWeight = 100 / holdings.length;
  return holdings.map((holding) => ({ id: holding.id, weight: equalWeight }));
}

function clampWeight(value: number) {
  return roundWeight(Math.min(100, Math.max(0, value)));
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}
