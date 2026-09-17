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
import { id as ethId } from 'ethers';
import type { CurrencyCode, LoanFacility } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { EthereumSepoliaCollateralVaultService } from '../../infrastructure/blockchain/ethereum-sepolia-collateral-vault.service';

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
class OfferLoanDto { @IsNumber() @Min(1) principal!: number; @IsInt() @Min(0) @Max(5000) haircutBps!: number; @IsInt() @Min(1) @Max(5000) interestRateBps!: number; @IsInt() @Min(1) @Max(3650) termDays!: number; }
class DisburseLoanDto { @IsOptional() @IsString() vaultTxHash?: string; }
class ReleaseCollateralDto { @IsString() vaultTxHash!: string; }

@Controller('lending')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LendingController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly vault: EthereumSepoliaCollateralVaultService,
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
    if (!collateral || !['PENDING_APPROVAL', 'ACTIVE'].includes(collateral.status)) {
      throw new NotFoundException('A pending or active collateral position is required');
    }
    const utilized = this.utilizedAmount(collateral.id);
    // Before underwriting, the owner can only request against the pledged
    // mark. The banker later applies the authoritative haircut in the offer.
    const available = collateral.status === 'PENDING_APPROVAL'
      ? collateral.pledgedValue
      : Number(Math.max(0, collateral.advanceableValue - utilized).toFixed(2));
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
      currency: 'USD',
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

  /**
   * Lets a banker underwrite a live, Sepolia-verified collateral position
   * directly.  This is the normal lender-led workflow: the asset owner locks
   * collateral, the bank offers terms, the owner accepts, then the bank
   * activates the on-chain vault position and disburses USD.
   */
  @Post('collateral/:collateralId/offer')
  @Roles('BANKER', 'PLATFORM_ADMIN')
  offerFromCollateral(
    @CurrentUser() user: AuthUser,
    @Param('collateralId') collateralId: string,
    @Body() dto: OfferLoanDto,
  ) {
    const collateral = this.db.snapshot.collateralPositions.find(
      (item) => item.id === collateralId,
    );
    if (!collateral || collateral.status !== 'PENDING_APPROVAL') {
      throw new NotFoundException(
        'A Sepolia-locked collateral position awaiting bank review is required',
      );
    }
    if (!collateral.vaultCollateralId || !collateral.vaultTxHash) {
      throw new BadRequestException(
        'A verified live Sepolia collateral vault position is required before offering a loan.',
      );
    }
    const existingLoan = this.db.snapshot.loans.find(
      (item) =>
        item.collateralId === collateral.id &&
        ['PENDING_APPROVAL', 'OFFERED', 'ACCEPTED', 'ACTIVE'].includes(
          item.status,
        ),
    );
    if (existingLoan) {
      throw new BadRequestException(
        'This collateral position already has an open loan workflow.',
      );
    }

    const maxLoan = Number(
      (collateral.pledgedValue * (1 - dto.haircutBps / 10_000)).toFixed(2),
    );
    if (dto.principal > maxLoan) {
      throw new BadRequestException(
        `Offer exceeds haircut-adjusted limit of ${maxLoan} ${collateral.currency}`,
      );
    }

    const now = new Date().toISOString();
    const loan: LoanFacility = {
      id: createId('loan'),
      organizationId: collateral.organizationId,
      collateralId: collateral.id,
      assetId: collateral.assetId,
      status: 'OFFERED',
      requestedByUserId: collateral.requestedByUserId,
      approvedByUserId: user.id,
      principal: dto.principal,
      currency: 'USD',
      interestRateBps: dto.interestRateBps,
      termDays: dto.termDays,
      outstanding: 0,
      ltvBps: Math.round((dto.principal / collateral.pledgedValue) * 10_000),
      bankerHaircutBps: dto.haircutBps,
      maxLoanAmount: maxLoan,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.loans.unshift(loan);
      const secured = draft.collateralPositions.find(
        (item) => item.id === collateral.id,
      )!;
      secured.status = 'ACTIVE';
      secured.haircutBps = dto.haircutBps;
      secured.advanceableValue = maxLoan;
      secured.approvedByUserId = user.id;
      secured.approvedAt = now;
      secured.updatedAt = now;
    });
    this.audit.log({
      organizationId: collateral.organizationId,
      actorUserId: user.id,
      action: 'lending.collateral_offer_created',
      entityType: 'Loan',
      entityId: loan.id,
      metadata: {
        collateralId: collateral.id,
        principal: dto.principal,
        haircutBps: dto.haircutBps,
      },
    });
    return this.hydrate(this.db.snapshot.loans.find((item) => item.id === loan.id)!);
  }

  @Post(':id/disburse')
  @Roles('BANKER', 'PLATFORM_ADMIN')
  async disburse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DisburseLoanDto) {
    const loan = this.db.snapshot.loans.find(
      (item) => item.id === id,
    );
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'ACCEPTED') {
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
    if (!collateral.vaultCollateralId || !this.vault.isConfigured()) {
      throw new BadRequestException('A verified live Sepolia collateral vault position is required before disbursal.');
    }
    const loanReference = ethId(`caprov:loan:${id}`);
    const activated = dto.vaultTxHash
      ? await this.vault.verifyLoanActivation({ txHash: dto.vaultTxHash, collateralId: collateral.vaultCollateralId, loanReference })
      : await this.vault.hasLoanActivation(collateral.vaultCollateralId, loanReference);
    if (!activated) throw new BadRequestException('The submitted transaction is not a confirmed matching Sepolia collateral-loan activation.');

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

  @Post(':id/offer')
  @Roles('BANKER', 'PLATFORM_ADMIN')
  offer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OfferLoanDto) {
    const loan = this.db.snapshot.loans.find((item) => item.id === id);
    if (!loan || loan.status !== 'PENDING_APPROVAL') throw new NotFoundException('Pending loan application not found');
    const collateral = this.db.snapshot.collateralPositions.find((item) => item.id === loan.collateralId);
    if (!collateral) throw new NotFoundException('Collateral not found');
    const maxLoan = Number((collateral.pledgedValue * (1 - dto.haircutBps / 10_000)).toFixed(2));
    if (dto.principal > maxLoan) throw new BadRequestException(`Offer exceeds haircut-adjusted limit of ${maxLoan} ${collateral.currency}`);
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.loans.find((item) => item.id === id)!;
      target.status = 'OFFERED'; target.principal = dto.principal;
      target.bankerHaircutBps = dto.haircutBps; target.maxLoanAmount = maxLoan;
      target.interestRateBps = dto.interestRateBps; target.termDays = dto.termDays;
      target.approvedByUserId = user.id; target.updatedAt = now;
      const secured = draft.collateralPositions.find((item) => item.id === loan.collateralId)!;
      secured.status = 'ACTIVE'; secured.haircutBps = dto.haircutBps;
      secured.advanceableValue = maxLoan; secured.approvedByUserId = user.id;
      secured.approvedAt = now; secured.updatedAt = now;
    });
    this.audit.log({ organizationId: loan.organizationId, actorUserId: user.id,
      action: 'lending.loan_offered', entityType: 'Loan', entityId: id,
      metadata: { collateralId: loan.collateralId, principal: dto.principal, haircutBps: dto.haircutBps },
    });
    return this.hydrate(this.db.snapshot.loans.find((item) => item.id === id)!);
  }

  @Post(':id/accept')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const loan = this.db.snapshot.loans.find((item) => item.id === id && item.organizationId === user.organizationId);
    if (!loan || loan.status !== 'OFFERED') throw new NotFoundException('Loan offer not found');
    this.db.mutate((draft) => { const target = draft.loans.find((item) => item.id === id)!; target.status = 'ACCEPTED'; target.updatedAt = new Date().toISOString(); });
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
      const borrowerWallet = draft.wallets.find((item) => item.organizationId === target.organizationId && item.currency === target.currency);
      if (!borrowerWallet || borrowerWallet.balance < target.outstanding) throw new BadRequestException('Lister simulated USD wallet has insufficient funds for repayment.');
      const bankerMembership = draft.memberships.find((item) => item.userId === target.approvedByUserId && item.role === 'BANKER');
      const bankWallet = bankerMembership && draft.wallets.find((item) => item.organizationId === bankerMembership.organizationId && item.currency === target.currency);
      if (!bankWallet) throw new BadRequestException('Bank treasury wallet is unavailable.');
      const repayment = target.outstanding;
      borrowerWallet.balance = Number((borrowerWallet.balance - repayment).toFixed(2)); borrowerWallet.updatedAt = now;
      bankWallet.balance = Number((bankWallet.balance + repayment).toFixed(2)); bankWallet.updatedAt = now;
      draft.walletTransactions.unshift({ id: createId('wtx'), organizationId: target.organizationId, direction: 'DEBIT', type: 'LOAN_REPAYMENT', amount: repayment, currency: target.currency, description: `Simulated USD repayment for loan ${target.id}`, referenceType: 'Loan', referenceId: target.id, createdAt: now, createdByUserId: user.id });
      draft.walletTransactions.unshift({ id: createId('wtx'), organizationId: bankerMembership.organizationId, direction: 'CREDIT', type: 'LOAN_REPAYMENT', amount: repayment, currency: target.currency, description: `Simulated USD repayment received for loan ${target.id}`, referenceType: 'Loan', referenceId: target.id, createdAt: now, createdByUserId: user.id });
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

  /**
   * The lender releases ERC-1155 collateral only after the USD repayment has
   * posted to both ledgers.  The API records the release only after verifying
   * the matching real Sepolia event.
   */
  @Post(':id/release-collateral')
  @Roles('BANKER', 'PLATFORM_ADMIN')
  async releaseCollateral(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReleaseCollateralDto,
  ) {
    const loan = this.db.snapshot.loans.find((item) => item.id === id);
    if (!loan || loan.status !== 'REPAID') {
      throw new BadRequestException(
        'Collateral can be released only after the facility is fully repaid.',
      );
    }
    const collateral = this.db.snapshot.collateralPositions.find(
      (item) => item.id === loan.collateralId,
    );
    if (!collateral || collateral.status !== 'ACTIVE' || !collateral.vaultCollateralId) {
      throw new NotFoundException('An active live Sepolia collateral position is required.');
    }
    const token = collateral.tokenId
      ? this.db.snapshot.tokens.find((item) => item.id === collateral.tokenId)
      : undefined;
    if (!token?.recipientAddress) {
      throw new BadRequestException('The collateral borrower wallet cannot be determined.');
    }
    const released = await this.vault.verifyRepaymentRelease({
      txHash: dto.vaultTxHash,
      collateralId: collateral.vaultCollateralId,
      borrower: token.recipientAddress,
    });
    if (!released) {
      throw new BadRequestException(
        'The submitted transaction is not a confirmed matching Sepolia collateral release.',
      );
    }
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      const target = draft.collateralPositions.find(
        (item) => item.id === collateral.id,
      )!;
      target.status = 'RELEASED';
      target.updatedAt = now;
    });
    this.audit.log({
      organizationId: loan.organizationId,
      actorUserId: user.id,
      action: 'lending.collateral_released_after_repayment',
      entityType: 'Collateral',
      entityId: collateral.id,
      metadata: { loanId: loan.id, vaultTxHash: dto.vaultTxHash },
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
