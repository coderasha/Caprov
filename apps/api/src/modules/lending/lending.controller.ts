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
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
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
      .filter((item) => item.organizationId === user.organizationId || user.roles.includes('BANKER'))
      .map((item) => this.hydrate(item));
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanDto) {
    const collateral = this.db.snapshot.collateralPositions.find(
      (item) =>
        item.id === dto.collateralId &&
        item.organizationId === user.organizationId,
    );
    if (!collateral || collateral.status !== 'ACTIVE') {
      throw new NotFoundException('Active collateral position not found');
    }
    const utilized = this.utilizedAmount(collateral.id);
    const available = Number(
      Math.max(0, collateral.advanceableValue - utilized).toFixed(2),
    );
    if (dto.principal > available) {
      throw new BadRequestException(
        `Principal exceeds available collateral capacity ${available} ${collateral.currency}`,
      );
    }
    const now = new Date().toISOString();
    const ltvBps = Math.round(
      (dto.principal / collateral.pledgedValue) * 10_000,
    );
    const loan: LoanFacility = {
      id: createId('loan'),
      organizationId: user.organizationId,
      collateralId: collateral.id,
      assetId: collateral.assetId,
      status: 'PENDING_APPROVAL',
      requestedByUserId: user.id,
      principal: dto.principal,
      currency: dto.currency ?? collateral.currency,
      interestRateBps: dto.interestRateBps ?? 650,
      termDays: dto.termDays ?? 365,
      outstanding: 0,
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
      metadata: {
        collateralId: collateral.id,
        principal: loan.principal,
        ltvBps,
      },
    });
    return this.hydrate(loan);
  }

  @Post(':id/disburse')
  @Roles('BANKER', 'PLATFORM_ADMIN')
  disburse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const loan = this.db.snapshot.loans.find(
      (item) => item.id === id,
    );
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Loan is not pending disbursal approval');
    }

    const collateral = this.db.snapshot.collateralPositions.find(
      (item) =>
        item.id === loan.collateralId &&
        item.organizationId === loan.organizationId,
    );
    if (!collateral || collateral.status !== 'ACTIVE') {
      throw new NotFoundException('Approved collateral position not found');
    }

    const available = Number(
      Math.max(0, collateral.advanceableValue - this.utilizedAmount(collateral.id))
        .toFixed(2),
    );
    if (loan.principal > available) {
      throw new BadRequestException(
        `Principal exceeds available collateral capacity ${available} ${collateral.currency}`,
      );
    }

    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.loans.find((item) => item.id === id)!;
      target.status = 'ACTIVE';
      target.outstanding = target.principal;
      target.approvedByUserId = user.id;
      target.disbursedAt = now;
      target.updatedAt = now;

      const bankWallet = draft.wallets.find((item) => item.organizationId === user.organizationId && item.currency === target.currency);
      if (!bankWallet || bankWallet.balance < target.principal) throw new BadRequestException('Bank simulated USD treasury has insufficient funds.');
      bankWallet.balance = Number((bankWallet.balance - target.principal).toFixed(2)); bankWallet.updatedAt = now;
      draft.walletTransactions.unshift({ id: createId('wtx'), organizationId: user.organizationId, direction: 'DEBIT', type: 'LOAN_DISBURSAL', amount: target.principal, currency: target.currency, description: `Simulated USD disbursal for loan ${target.id}`, referenceType: 'Loan', referenceId: target.id, createdAt: now, createdByUserId: user.id });
      const wallet =
        draft.wallets.find(
          (item) =>
            item.organizationId === target.organizationId &&
            item.currency === target.currency,
        ) ??
        (() => {
          const created = {
            organizationId: user.organizationId,
            organizationId: target.organizationId,
            currency: target.currency,
            balance: 0,
            updatedAt: now,
          };
          draft.wallets.push(created);
          return created;
        })();

      wallet.balance = Number((wallet.balance + target.principal).toFixed(2));
      wallet.updatedAt = now;

      draft.walletTransactions.unshift({
        id: createId('wtx'),
        organizationId: target.organizationId,
        direction: 'CREDIT',
        type: 'LOAN_DISBURSAL',
        amount: target.principal,
        currency: target.currency,
        description: `Disbursal credited for loan ${target.id}`,
        referenceType: 'Loan',
        referenceId: target.id,
        createdAt: now,
        createdByUserId: user.id,
      });
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'lending.loan_disbursed',
      entityType: 'Loan',
      entityId: id,
      metadata: {
        principal: loan.principal,
        currency: loan.currency,
      },
    });
    return this.hydrate(this.db.snapshot.loans.find((item) => item.id === id)!);
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
        this.db.snapshot.collateralPositions.find(
          (item) => item.id === loan.collateralId,
        ) ?? null,
      asset:
        this.db.snapshot.assets.find((item) => item.id === loan.assetId) ??
        null,
    };
  }

  private utilizedAmount(collateralId: string) {
    return this.db.snapshot.loans
      .filter(
        (item) =>
          item.collateralId === collateralId && item.status === 'ACTIVE',
      )
      .reduce((sum, loan) => sum + loan.outstanding, 0);
  }
}
