import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CollateralController } from './collateral.controller';

@Module({
  imports: [AuditModule],
  controllers: [CollateralController],
})
export class CollateralModule {}
