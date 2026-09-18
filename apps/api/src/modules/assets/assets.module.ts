import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AuditModule, IntelligenceModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
