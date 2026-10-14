import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TokenizationController } from './tokenization.controller';

@Module({
  imports: [AuditModule, BlockchainModule, AuthModule],
  controllers: [TokenizationController],
})
export class TokenizationModule {}
