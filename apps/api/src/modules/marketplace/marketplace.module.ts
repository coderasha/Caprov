import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { MarketplaceController } from './marketplace.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [MarketplaceController],
})
export class MarketplaceModule {}
