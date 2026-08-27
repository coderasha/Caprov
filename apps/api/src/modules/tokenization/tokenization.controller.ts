import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { TokenPosition } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class TokenizeDto {
  @IsString()
  assetId!: string;

  @IsInt()
  @Min(1)
  supply!: number;

  @IsOptional()
  @IsString()
  @MinLength(42)
  recipientAddress?: string;
}

@Controller('tokenization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TokenizationController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly sepolia: EthereumSepoliaTokenService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return {
      network: this.sepolia.getNetworkStatus(),
      tokens: this.db.snapshot.tokens
        .filter((item) => item.organizationId === user.organizationId)
        .map((token) => this.hydrate(token)),
    };
  }

  @Get('network')
  async network() {
    const status = this.sepolia.getNetworkStatus();
    const probe = await this.sepolia.probeRpc();
    return { ...status, rpcProbe: probe };
  }

  @Post('tokens')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async tokenize(@CurrentUser() user: AuthUser, @Body() dto: TokenizeDto) {
    const asset = this.db.snapshot.assets.find(
      (item) =>
        item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) throw new NotFoundException('Asset not found');
    if (dto.supply > 1_000_000_000) {
      throw new BadRequestException('Supply too large');
    }

    const now = new Date().toISOString();
    const pendingId = createId('tok');
    const mint = await this.sepolia.mintAssetToken({
      assetId: asset.id,
      tokenId: pendingId,
      supply: dto.supply,
      recipientAddress: dto.recipientAddress,
    });

    const token: TokenPosition = {
      id: pendingId,
      organizationId: user.organizationId,
      assetId: asset.id,
      status:
        mint.status === 'CONFIRMED'
          ? 'CONFIRMED'
          : mint.status === 'FAILED'
            ? 'FAILED'
            : 'SIMULATED',
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

    this.db.mutate((draft) => {
      draft.tokens.unshift(token);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'tokenization.minted',
      entityType: 'Token',
      entityId: token.id,
      metadata: {
        assetId: asset.id,
        mode: token.mode,
        txHash: token.txHash,
        chainId: token.chainId,
        error: mint.error,
      },
    });
    return this.hydrate(token);
  }

  private hydrate(token: TokenPosition) {
    return {
      ...token,
      asset:
        this.db.snapshot.assets.find((item) => item.id === token.assetId) ??
        null,
      valuation:
        this.db.snapshot.valuations
          .filter((item) => item.assetId === token.assetId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    };
  }
}
