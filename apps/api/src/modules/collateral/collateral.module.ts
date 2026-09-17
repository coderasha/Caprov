import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { CollateralController } from './collateral.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [CollateralController],
})
export class CollateralModule {}
