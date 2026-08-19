import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LendingController } from './lending.controller';

@Module({
  imports: [AuditModule],
  controllers: [LendingController],
})
export class LendingModule {}
