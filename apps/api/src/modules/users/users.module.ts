import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from './users.controller';

@Module({
  imports: [AuditModule],
  controllers: [UsersController],
})
export class UsersModule {}
