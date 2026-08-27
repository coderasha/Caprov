import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('rbac')
@UseGuards(JwtAuthGuard)
export class RbacController {
  @Get('roles')
  roles() {
    return [
      {
        key: 'PLATFORM_ADMIN',
        name: 'Platform admin',
        description: 'Full access across organizations.',
      },
      {
        key: 'ORG_ADMIN',
        name: 'Organization admin',
        description: 'Manage members, assets and settings.',
      },
      {
        key: 'ANALYST',
        name: 'Analyst',
        description: 'Create assets, ingest documents and run intelligence.',
      },
      {
        key: 'COMPLIANCE',
        name: 'Compliance',
        description: 'Review documents, DNA provenance and audit history.',
      },
      {
        key: 'VIEWER',
        name: 'Viewer',
        description: 'Read-only access to assets, portfolios and intelligence.',
      },
    ];
  }
}
