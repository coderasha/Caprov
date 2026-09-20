import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.audit.list(
      user.organizationId,
      limit ? Number(limit) : 100,
      user.roles.includes('PLATFORM_ADMIN'),
    );
  }

  @Get('assets/:assetId')
  listForAsset(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.audit.listForAsset(
      user.organizationId,
      assetId,
      user.roles.includes('PLATFORM_ADMIN'),
    );
  }
}
