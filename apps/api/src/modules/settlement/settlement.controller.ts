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
import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { SettlementRecord } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class CreateSettlementDto {
  @IsString()
  tradeId!: string;

  @IsOptional()
  @IsEnum(['OFF_CHAIN', 'TOKENIZED_TRANSFER'])
  method?: 'OFF_CHAIN' | 'TOKENIZED_TRANSFER';

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.settlements
      .filter((item) => item.organizationId === user.organizationId)
      .map((item) => this.hydrate(item));
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'COMPLIANCE', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSettlementDto) {
    const trade = this.db.snapshot.trades.find(
      (item) => item.id === dto.tradeId && item.organizationId === user.organizationId,
    );
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.status === 'SETTLED') {
      throw new BadRequestException('Trade already settled');
    }
    const existing = this.db.snapshot.settlements.find((item) => item.tradeId === trade.id);
    if (existing) return this.hydrate(existing);

    const now = new Date().toISOString();
    const settlement: SettlementRecord = {
      id: createId('stl'),
      organizationId: user.organizationId,
      tradeId: trade.id,
      assetId: trade.assetId,
      status: 'PENDING',
      method: dto.method ?? 'OFF_CHAIN',
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
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const settlement = this.db.snapshot.settlements.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!settlement) throw new NotFoundException('Settlement not found');
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const draftSettlement = draft.settlements.find((item) => item.id === id)!;
      draftSettlement.status = 'COMPLETED';
      draftSettlement.completedAt = now;
      draftSettlement.updatedAt = now;
      const draftTrade = draft.trades.find((item) => item.id === draftSettlement.tradeId);
      if (draftTrade) {
        draftTrade.status = 'SETTLED';
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
    return this.hydrate(this.db.snapshot.settlements.find((item) => item.id === id)!);
  }

  private hydrate(settlement: SettlementRecord) {
    return {
      ...settlement,
      trade: this.db.snapshot.trades.find((item) => item.id === settlement.tradeId) ?? null,
      asset: this.db.snapshot.assets.find((item) => item.id === settlement.assetId) ?? null,
    };
  }
}
