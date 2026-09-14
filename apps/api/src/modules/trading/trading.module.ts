import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { TradingController } from './trading.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [TradingController],
})
export class TradingModule {}
