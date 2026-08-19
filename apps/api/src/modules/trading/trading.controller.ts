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
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { OrderSide, TradeRecord, TradingOrder } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

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
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return {
      orders: this.listOrders(user),
      trades: this.listTrades(user),
    };
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.orders.filter((item) => item.organizationId === user.organizationId);
  }

  @Get('trades')
  listTrades(@CurrentUser() user: AuthUser) {
    return this.db.snapshot.trades.filter((item) => item.organizationId === user.organizationId);
  }

  @Post('orders')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    const listing = this.db.snapshot.listings.find(
      (item) => item.id === dto.listingId && item.organizationId === user.organizationId,
    );
    if (!listing || listing.status === 'CLOSED' || listing.status === 'CANCELLED') {
      throw new NotFoundException('Open listing not found');
    }
    if (dto.quantityBps > listing.remainingBps) {
      throw new BadRequestException('Order quantity exceeds remaining listing interest');
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
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  matchOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = this.db.snapshot.orders.find(
      (item) => item.id === id && item.organizationId === user.organizationId,
    );
    if (!order || order.status === 'FILLED' || order.status === 'CANCELLED') {
      throw new NotFoundException('Open order not found');
    }
    const listing = this.db.snapshot.listings.find((item) => item.id === order.listingId);
    if (!listing || listing.remainingBps <= 0) {
      throw new BadRequestException('Listing has no remaining quantity');
    }
    const fillBps = Math.min(order.quantityBps - order.filledBps, listing.remainingBps);
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
      const draftListing = draft.listings.find((item) => item.id === listing.id)!;
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
