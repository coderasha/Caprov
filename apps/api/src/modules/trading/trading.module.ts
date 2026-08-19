import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TradingController } from './trading.controller';

@Module({
  imports: [AuditModule],
  controllers: [TradingController],
})
export class TradingModule {}
