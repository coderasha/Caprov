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
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { CurrencyCode, LoanFacility } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class CreateLoanDto {
  @IsString()
  collateralId!: string;

  @IsNumber()
  @Min(1)
  principal!: number;

  @IsOptional()
  @IsString()
  currency?: CurrencyCode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  interestRateBps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  termDays?: number;
}

@Controller('lending')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LendingController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.loans
      .filter((item) => item.organizationId === user.organizationId)
      .map((item) => this.hydrate(item));
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanDto) {
    const collateral = this.db.snapshot.collateralPositions.find(
      (item) => item.id === dto.collateralId && item.organizationId === user.organizationId,
    );
    if (!collateral || collateral.status !== 'ACTIVE') {
      throw new NotFoundException('Active collateral position not found');
    }
    const utilized = this.utilizedAmount(collateral.id);
    const available = Number(Math.max(0, collateral.advanceableValue - utilized).toFixed(2));
    if (dto.principal > available) {
      throw new BadRequestException(
        `Principal exceeds available collateral capacity ${available} ${collateral.currency}`,
      );
    }
    const now = new Date().toISOString();
    const ltvBps = Math.round((dto.principal / collateral.pledgedValue) * 10_000);
    const loan: LoanFacility = {
      id: createId('loan'),
      organizationId: user.organizationId,
      collateralId: collateral.id,
      assetId: collateral.assetId,
      status: 'ACTIVE',
      principal: dto.principal,
      currency: dto.currency ?? collateral.currency,
      interestRateBps: dto.interestRateBps ?? 650,
      termDays: dto.termDays ?? 365,
      outstanding: dto.principal,
      ltvBps,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.loans.unshift(loan);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'lending.loan_opened',
      entityType: 'Loan',
      entityId: loan.id,
      metadata: { collateralId: collateral.id, principal: loan.principal, ltvBps },
    });
    return this.hydrate(loan);
  }

  @Post(':id/repay')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  repay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const loan = this.db.snapshot.loans.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!loan || loan.status !== 'ACTIVE') {
      throw new NotFoundException('Active loan not found');
    }
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.loans.find((item) => item.id === id)!;
      target.status = 'REPAID';
      target.outstanding = 0;
      target.repaidAt = now;
      target.updatedAt = now;
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'lending.loan_repaid',
      entityType: 'Loan',
      entityId: id,
    });
    return this.hydrate(this.db.snapshot.loans.find((item) => item.id === id)!);
  }

  private hydrate(loan: LoanFacility) {
    return {
      ...loan,
      collateral:
        this.db.snapshot.collateralPositions.find((item) => item.id === loan.collateralId) ?? null,
      asset: this.db.snapshot.assets.find((item) => item.id === loan.assetId) ?? null,
    };
  }

  private utilizedAmount(collateralId: string) {
    return this.db.snapshot.loans
      .filter((item) => item.collateralId === collateralId && item.status === 'ACTIVE')
      .reduce((sum, loan) => sum + loan.outstanding, 0);
  }
}
