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
import { getAddress, isAddress } from 'ethers';
import type { TokenPosition } from '@caprov/types';
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

class RegisterWalletMintDto {
  @IsString()
  assetId!: string;

  @IsInt()
  @Min(1)
  supply!: number;

  @IsString()
  @MinLength(66)
  txHash!: string;

  @IsString()
  @MinLength(42)
  recipientAddress!: string;
}

@Controller('tokenization')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TokenizationController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly sepolia: EthereumSepoliaTokenService,
    private readonly marketplace: EthereumSepoliaMarketplaceService,
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
    const network = this.sepolia.getNetworkStatus();
    // Tokens minted on a retired contract cannot be escrowed by the active
    // marketplace. They are retained as history but do not block a one-time
    // mint on the currently configured ERC-1155 contract.
    const existing = this.db.snapshot.tokens.find(
      (item) =>
        item.assetId === asset.id &&
        item.status === 'CONFIRMED' &&
        item.contractAddress?.toLowerCase() === network.contractAddress?.toLowerCase(),
    );
    if (existing) {
      throw new BadRequestException(
        'This asset is already tokenized. Its supply is immutable and cannot be minted again.',
      );
    }
    if (dto.supply > 1_000_000_000) {
      throw new BadRequestException('Supply too large');
    }
    if (!network.liveMintReady) {
      throw new BadRequestException(
        'Live Ethereum Sepolia tokenization is not configured. Set ETHEREUM_SEPOLIA_PRIVATE_KEY (or ETHEREUM_SEPOLIA_MNEMONIC) and ETHEREUM_TOKEN_CONTRACT before minting.',
      );
    }
    let marketplaceAssetToken: string | null;
    try {
      marketplaceAssetToken = await this.marketplace.getAssetTokenAddress();
    } catch {
      throw new BadRequestException(
        'Cannot verify the Sepolia marketplace asset-token contract. Tokenization was not attempted.',
      );
    }
    if (!marketplaceAssetToken || marketplaceAssetToken.toLowerCase() !== network.contractAddress?.toLowerCase()) {
      throw new BadRequestException(
        `Tokenization is blocked because ETHEREUM_TOKEN_CONTRACT (${network.contractAddress ?? 'missing'}) does not match the marketplace asset token (${marketplaceAssetToken ?? 'unavailable'}). Restart the API after correcting apps/api/.env.`,
      );
    }

    const now = new Date().toISOString();
    const pendingId = createId('tok');
    const mint = await this.sepolia.mintAssetToken({
      assetId: asset.id,
      tokenId: pendingId,
      supply: dto.supply,
      recipientAddress: dto.recipientAddress,
    });
    if (mint.status !== 'CONFIRMED' || mint.mode !== 'LIVE') {
      throw new BadRequestException(
        `Live Ethereum Sepolia mint failed. No token was created.${mint.error ? ` ${mint.error}` : ''}`,
      );
    }

    const token: TokenPosition = {
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

  /** Records a confirmed mint signed by the lister's MetaMask account. */
  @Post('tokens/wallet-mints')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async registerWalletMint(@CurrentUser() user: AuthUser, @Body() dto: RegisterWalletMintDto) {
    if (!isAddress(dto.recipientAddress)) {
      throw new BadRequestException('A valid recipient wallet address is required.');
    }
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === dto.assetId && item.organizationId === user.organizationId,
    );
    if (!asset) throw new NotFoundException('Asset not found');
    if (dto.supply > 1_000_000_000) throw new BadRequestException('Supply too large');

    const network = this.sepolia.getNetworkStatus();
    if (!network.contractAddress) {
      throw new BadRequestException('ETHEREUM_TOKEN_CONTRACT must be configured to register a wallet-signed mint.');
    }
    const existing = this.db.snapshot.tokens.find(
      (item) =>
        item.assetId === asset.id &&
        item.status === 'CONFIRMED' &&
        item.contractAddress?.toLowerCase() === network.contractAddress?.toLowerCase(),
    );
    if (existing) throw new BadRequestException('This asset is already tokenized on the active ERC-1155 contract.');

    const marketplaceAssetToken = await this.marketplace.getAssetTokenAddress();
    if (!marketplaceAssetToken || marketplaceAssetToken.toLowerCase() !== network.contractAddress.toLowerCase()) {
      throw new BadRequestException('ETHEREUM_TOKEN_CONTRACT does not match the active Sepolia marketplace asset-token contract.');
    }
    const recipientAddress = getAddress(dto.recipientAddress);
    const valid = await this.sepolia.verifyWalletMintTransaction({
      txHash: dto.txHash,
      assetId: asset.id,
      supply: dto.supply,
      recipientAddress,
    });
    if (!valid) {
      throw new BadRequestException('The submitted transaction is not a confirmed matching ERC-1155 mint for this asset.');
    }

    const now = new Date().toISOString();
    const token: TokenPosition = {
      id: createId('tok'), organizationId: user.organizationId, assetId: asset.id,
      status: 'CONFIRMED', chainId: network.chainId, chainName: network.chainName,
      contractAddress: network.contractAddress, tokenId: this.sepolia.tokenIdForAsset(asset.id),
      supply: dto.supply, recipientAddress, txHash: dto.txHash,
      explorerUrl: `https://sepolia.etherscan.io/tx/${dto.txHash}`, mode: 'LIVE',
      createdAt: now, updatedAt: now,
    };
    this.db.mutate((draft) => draft.tokens.unshift(token));
    this.audit.log({
      organizationId: user.organizationId, actorUserId: user.id,
      action: 'tokenization.wallet_mint_registered', entityType: 'Token', entityId: token.id,
      metadata: { assetId: asset.id, txHash: dto.txHash, recipientAddress },
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
