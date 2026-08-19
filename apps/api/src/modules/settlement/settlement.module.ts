import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettlementController } from './settlement.controller';

@Module({
  imports: [AuditModule],
  controllers: [SettlementController],
})
export class SettlementModule {}
