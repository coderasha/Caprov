import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { LlmModelsService } from './llm-models.service';

@Module({
  imports: [AuditModule, BlockchainModule],
  controllers: [IntelligenceController],
  providers: [IntelligenceService, LlmModelsService],
  exports: [IntelligenceService, LlmModelsService],
})
export class IntelligenceModule {}
