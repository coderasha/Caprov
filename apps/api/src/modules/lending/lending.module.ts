import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LendingController } from './lending.controller';
import { RazorpayController } from './razorpay.controller';

@Module({
  imports: [AuditModule],
  controllers: [LendingController, RazorpayController],
})
export class LendingModule {}
