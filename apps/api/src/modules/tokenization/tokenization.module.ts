import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { TokenizationController } from './tokenization.controller';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [TokenizationController],
})
export class TokenizationModule {}
