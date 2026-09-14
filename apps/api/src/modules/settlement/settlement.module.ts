import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { SettlementController } from './settlement.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [SettlementController],
})
export class SettlementModule {}
