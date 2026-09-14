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
} from 'class-validator';
import type { OrderSide, TradeRecord, TradingOrder } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { EthereumSepoliaMarketplaceService } from '../../infrastructure/blockchain/ethereum-sepolia-marketplace.service';
import { isAddress, getAddress, formatUnits } from 'ethers';

class RegisterOnChainTradeDto {
  @IsString() listingId!: string;
  @IsString() purchaseId!: string;
  @IsString() purchaseTxHash!: string;
  @IsString() buyerWalletAddress!: string;
  @IsInt() @Min(1) tokenUnits!: number;
  @IsString() paymentCapWei!: string;
}

class CreateOrderDto {
  @IsString()
  listingId!: string;

  @IsEnum(['BUY', 'SELL'])
  side!: OrderSide;

  @IsNumber()
  @Min(1)
  price!: number;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantityBps!: number;

  @IsOptional()
  @IsBoolean()
  autoMatch?: boolean;
}

@Controller('trading')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TradingController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly marketplace: EthereumSepoliaMarketplaceService,
  ) {}

  @Post('on-chain-trades')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  async registerOnChainTrade(@CurrentUser() user: AuthUser, @Body() dto: RegisterOnChainTradeDto) {
    if (!isAddress(dto.buyerWalletAddress) || !/^\d+$/.test(dto.purchaseId) || !/^\d+$/.test(dto.paymentCapWei)) throw new BadRequestException('Invalid purchase reference.');
    const listing = this.db.snapshot.listings.find((item) => item.id === dto.listingId && item.onChainListingId && item.pricePerTokenWei);
    if (!listing || listing.organizationId === user.organizationId) throw new BadRequestException('This tokenized listing is not available to this buyer.');
    if (dto.tokenUnits > (listing.availableTokenUnits ?? 0)) throw new BadRequestException('Trade units exceed the available token units.');
    const valid = await this.marketplace.verifyPurchaseTransaction({ txHash: dto.purchaseTxHash, purchaseId: dto.purchaseId, listingId: listing.onChainListingId!, buyer: dto.buyerWalletAddress, units: String(dto.tokenUnits) });
    if (!valid) throw new BadRequestException('The submitted transaction is not a confirmed matching CAP escrow purchase.');
    const now = new Date().toISOString();
    const trade: TradeRecord = { id: createId('trd'), organizationId: user.organizationId, listingId: listing.id, orderId: `chain_${dto.purchaseId}`, assetId: listing.assetId, status: 'PENDING_SETTLEMENT', price: Number(formatUnits(BigInt(listing.pricePerTokenWei!), 18)), currency: 'USD', quantityBps: Math.round((dto.tokenUnits / (listing.totalTokenSupply ?? dto.tokenUnits)) * 10_000), notional: Number(formatUnits(BigInt(dto.paymentCapWei), 18)), onChainPurchaseId: dto.purchaseId, onChainListingId: listing.onChainListingId, buyerWalletAddress: getAddress(dto.buyerWalletAddress), tokenUnits: dto.tokenUnits, paymentCapWei: dto.paymentCapWei, purchaseTxHash: dto.purchaseTxHash, createdAt: now, updatedAt: now };
    this.db.mutate((draft) => { draft.trades.unshift(trade); });
    this.audit.log({ organizationId: user.organizationId, actorUserId: user.id, action: 'trading.cap_escrowed', entityType: 'Trade', entityId: trade.id, metadata: { purchaseId: dto.purchaseId, tokenUnits: dto.tokenUnits } });
    return trade;
  }

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return {
      orders: this.listOrders(user),
      trades: this.listTrades(user),
    };
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.orders.filter(
      (item) => item.organizationId === user.organizationId,
    );
  }

  @Get('trades')
  listTrades(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.trades.filter((item) => {
      if (item.organizationId === user.organizationId) return true;
      return this.db.snapshot.listings.some(
        (listing) =>
          listing.id === item.listingId &&
          listing.organizationId === user.organizationId,
      );
    });
  }

  @Post('orders')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'COMPLIANCE', 'VIEWER')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    const listing = this.db.snapshot.listings.find(
      (item) =>
        item.id === dto.listingId,
    );
    if (
      !listing ||
      listing.status === 'CLOSED' ||
      listing.status === 'CANCELLED'
    ) {
      throw new NotFoundException('Open listing not found');
    }
    if (listing.offeringType === 'LEASE') {
      throw new BadRequestException(
        'Lease listings are not tradeable. Contact the org admin to lease.',
      );
    }
    // A listing represents the seller's offered interest. The seller's tenant
    // cannot take the other side of that listing, even through another user.
    if (listing.organizationId === user.organizationId) {
      throw new BadRequestException(
        'The listing owner cannot place a buy order against its own asset listing.',
      );
    }
    if (dto.quantityBps > listing.remainingBps) {
      throw new BadRequestException(
        'Order quantity exceeds remaining listing interest',
      );
    }
    const now = new Date().toISOString();
    const order: TradingOrder = {
      id: createId('ord'),
      organizationId: user.organizationId,
      listingId: listing.id,
      assetId: listing.assetId,
      side: dto.side,
      status: 'OPEN',
      price: dto.price,
      currency: listing.currency,
      quantityBps: dto.quantityBps,
      filledBps: 0,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.orders.unshift(order);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'trading.order_created',
      entityType: 'Order',
      entityId: order.id,
      metadata: { listingId: listing.id, side: dto.side },
    });

    const shouldMatch = dto.autoMatch !== false && dto.side === 'BUY';
    if (shouldMatch) {
      return this.matchOrder(user, order.id);
    }
    return order;
  }

  @Post('orders/:id/match')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'COMPLIANCE', 'VIEWER')
  matchOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = this.db.snapshot.orders.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!order || order.status === 'FILLED' || order.status === 'CANCELLED') {
      throw new NotFoundException('Open order not found');
    }
    const listing = this.db.snapshot.listings.find(
      (item) => item.id === order.listingId,
    );
    if (!listing || listing.remainingBps <= 0) {
      throw new BadRequestException('Listing has no remaining quantity');
    }
    if (listing.offeringType === 'LEASE') {
      throw new BadRequestException(
        'Lease listings cannot be matched as trades',
      );
    }
    const fillBps = Math.min(
      order.quantityBps - order.filledBps,
      listing.remainingBps,
    );
    if (fillBps <= 0) {
      throw new BadRequestException('Nothing left to fill');
    }
    const now = new Date().toISOString();
    const notional = Number(((order.price * fillBps) / 10_000).toFixed(2));
    const trade: TradeRecord = {
      id: createId('trd'),
      organizationId: user.organizationId,
      listingId: listing.id,
      orderId: order.id,
      assetId: order.assetId,
      status: 'PENDING_SETTLEMENT',
      price: order.price,
      currency: order.currency,
      quantityBps: fillBps,
      notional,
      createdAt: now,
      updatedAt: now,
    };

    this.db.mutate((draft) => {
      const draftOrder = draft.orders.find((item) => item.id === order.id)!;
      const draftListing = draft.listings.find(
        (item) => item.id === listing.id,
      )!;
      draftOrder.filledBps += fillBps;
      draftOrder.status =
        draftOrder.filledBps >= draftOrder.quantityBps
          ? 'FILLED'
          : draftOrder.filledBps > 0
            ? 'PARTIAL'
            : 'OPEN';
      draftOrder.updatedAt = now;
      draftListing.remainingBps -= fillBps;
      draftListing.status =
        draftListing.remainingBps <= 0
          ? 'FILLED'
          : draftListing.remainingBps < draftListing.quantityBps
            ? 'PARTIALLY_FILLED'
            : 'OPEN';
      draftListing.updatedAt = now;
      draft.trades.unshift(trade);
    });

    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'trading.trade_matched',
      entityType: 'Trade',
      entityId: trade.id,
      metadata: { orderId: order.id, notional },
    });

    return {
      order: this.db.snapshot.orders.find((item) => item.id === order.id),
      trade,
      listing: this.db.snapshot.listings.find((item) => item.id === listing.id),
    };
  }
}
