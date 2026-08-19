import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController],
})
export class OrganizationsModule {}
