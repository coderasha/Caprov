import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { IndiaPostDirectoryService } from './india-post-directory.service';
import { LgdDirectoryService } from './lgd-directory.service';

@Module({
  imports: [AuditModule, IntelligenceModule],
  controllers: [AssetsController],
  providers: [AssetsService, IndiaPostDirectoryService, LgdDirectoryService],
  exports: [AssetsService],
})
export class AssetsModule {}
