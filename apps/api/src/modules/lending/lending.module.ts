import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { LendingController } from './lending.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [LendingController],
})
export class LendingModule {}
