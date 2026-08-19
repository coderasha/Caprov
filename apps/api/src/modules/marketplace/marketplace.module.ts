import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MarketplaceController } from './marketplace.controller';

@Module({
  imports: [AuditModule],
  controllers: [MarketplaceController],
})
export class MarketplaceModule {}
