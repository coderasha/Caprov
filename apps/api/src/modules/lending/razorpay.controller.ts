import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';

class TestOrderDto { @IsInt() @Min(100) amountPaise!: number; @IsOptional() @IsString() receipt?: string; }

@Controller()
export class RazorpayController {
  constructor(private readonly audit: AuditService) {}

  @Post('lending/razorpay/test-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BANKER', 'ORG_ADMIN', 'PLATFORM_ADMIN')
  async createTestOrder(@CurrentUser() user: AuthUser, @Body() dto: TestOrderDto) {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim(); const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keyId || !keySecret) throw new BadRequestException('Razorpay test credentials are not configured.');
    const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: dto.amountPaise, currency: 'INR', receipt: dto.receipt ?? `caprov_${Date.now()}`, notes: { organizationId: user.organizationId, environment: 'test' } }) });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new BadRequestException('Razorpay could not create the test order.');
    this.audit.log({ organizationId: user.organizationId, actorUserId: user.id, action: 'razorpay.test_order_created', entityType: 'RazorpayOrder', entityId: String(body.id), metadata: { amountPaise: dto.amountPaise, currency: 'INR' } });
    return { id: body.id, amount: body.amount, currency: body.currency, keyId };
  }

  @Post('webhooks/razorpay')
  async webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature?: string, @Headers('x-razorpay-event-id') eventId?: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    const raw = request.rawBody;
    if (!secret || !signature || !raw) throw new BadRequestException('Invalid Razorpay webhook configuration.');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new BadRequestException('Invalid Razorpay webhook signature.');
    const event = request.body as { event?: string; payload?: { payment?: { entity?: { id?: string; status?: string; amount?: number; currency?: string; order_id?: string } } } };
    this.audit.log({ organizationId: 'platform', actorUserId: 'system', action: 'razorpay.webhook_verified', entityType: 'RazorpayWebhook', entityId: eventId ?? event.payload?.payment?.entity?.id ?? 'unknown', metadata: { event: event.event, paymentId: event.payload?.payment?.entity?.id, orderId: event.payload?.payment?.entity?.order_id, status: event.payload?.payment?.entity?.status, amount: event.payload?.payment?.entity?.amount, currency: event.payload?.payment?.entity?.currency } });
    return { received: true };
  }
}
