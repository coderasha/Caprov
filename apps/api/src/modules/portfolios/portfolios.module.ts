import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PortfoliosController } from './portfolios.controller';

@Module({
  imports: [AuditModule],
  controllers: [PortfoliosController],
})
export class PortfoliosModule {}
