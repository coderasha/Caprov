import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { OrganizationStatus } from '@caprov/types';
import { hash } from 'bcryptjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { getPreferredDefaultLlmModelId } from '../intelligence/llm-catalog';

class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  organizationName!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

class ReviewAccessRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  note?: string;
}

class UpdateOrganizationStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: OrganizationStatus;

  @IsOptional()
  @IsString()
  @MinLength(2)
  note?: string;
}

class AssignOrganizationAdminDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('PLATFORM_ADMIN')
  list() {
    return this.db.snapshot.organizations.map((organization) =>
      this.toPlatformOrganizationRow(organization.id),
    );
  }

  @Get('requests')
  @Roles('PLATFORM_ADMIN')
  requests() {
    return this.db.snapshot.organizationAccessRequests
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({
        id: request.id,
        organizationName: request.organizationName,
        requesterName: request.requesterName,
        requesterEmail: request.requesterEmail,
        requesterTitle: request.requesterTitle,
        status: request.status,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt,
        reviewedByUserId: request.reviewedByUserId,
        reviewNote: request.reviewNote,
      }));
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === user.organizationId,
    );
    const memberCount = this.db.snapshot.memberships.filter(
      (item) => item.organizationId === user.organizationId,
    ).length;
    const assetCount = this.db.snapshot.assets.filter(
      (item) => item.organizationId === user.organizationId,
    ).length;
    const walletBalances = this.db.snapshot.wallets
      .filter((item) => item.organizationId === user.organizationId)
      .sort((a, b) => a.currency.localeCompare(b.currency));
    const walletTransactions = this.db.snapshot.walletTransactions
      .filter((item) => item.organizationId === user.organizationId)
      .slice(0, 10);
    return {
      ...organization,
      memberCount,
      assetCount,
      roles: user.roles,
      walletBalances,
      walletTransactions,
    };
  }

  @Post()
  @Roles('PLATFORM_ADMIN')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    const created = await this.createOrganizationAndAdmin(dto);
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization.created_by_platform_admin',
      entityType: 'Organization',
      entityId: created.organization.id,
      metadata: { adminEmail: created.admin.email },
    });
    return created;
  }

  @Post('requests/:id/approve')
  @Roles('PLATFORM_ADMIN')
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewAccessRequestDto,
  ) {
    const request = this.db.snapshot.organizationAccessRequests.find(
      (item) => item.id === id,
    );
    if (!request) {
      return null;
    }
    if (request.status !== 'PENDING') {
      return request;
    }

    const created = await this.createOrganizationAndAdmin(
      {
        organizationName: request.organizationName,
        fullName: request.requesterName,
        email: request.requesterEmail,
        password: 'approved-via-request',
        title: request.requesterTitle,
      },
      request.passwordHash,
      request.requestedSlug,
    );

    const reviewedAt = new Date().toISOString();
    this.db.mutate((draft) => {
      const current = draft.organizationAccessRequests.find(
        (item) => item.id === id,
      );
      if (current) {
        current.status = 'APPROVED';
        current.reviewedAt = reviewedAt;
        current.reviewedByUserId = user.id;
        current.reviewNote = dto.note;
      }
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization_access_request.approved',
      entityType: 'OrganizationAccessRequest',
      entityId: id,
      metadata: {
        approvedOrganizationId: created.organization.id,
        requesterEmail: request.requesterEmail,
      },
    });
    return {
      id,
      status: 'APPROVED' as const,
      organizationId: created.organization.id,
      reviewedAt,
    };
  }

  @Post('requests/:id/reject')
  @Roles('PLATFORM_ADMIN')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewAccessRequestDto,
  ) {
    const reviewedAt = new Date().toISOString();
    const updated = this.db.mutate((draft) => {
      const request = draft.organizationAccessRequests.find(
        (item) => item.id === id,
      );
      if (!request) {
        return null;
      }
      if (request.status !== 'PENDING') {
        return request;
      }
      request.status = 'REJECTED';
      request.reviewedAt = reviewedAt;
      request.reviewedByUserId = user.id;
      request.reviewNote = dto.note;
      return request;
    });
    if (!updated) {
      return null;
    }
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization_access_request.rejected',
      entityType: 'OrganizationAccessRequest',
      entityId: id,
      metadata: { requesterEmail: updated.requesterEmail },
    });
    return {
      id,
      status: updated.status,
      reviewedAt: updated.reviewedAt,
    };
  }

  @Get(':id')
  @Roles('PLATFORM_ADMIN')
  detail(@Param('id') id: string) {
    return this.toPlatformOrganizationRow(id);
  }

  @Get(':id/members')
  @Roles('PLATFORM_ADMIN')
  members(@Param('id') id: string) {
    return this.db.snapshot.memberships
      .filter((item) => item.organizationId === id)
      .map((membership) => {
        const member = this.db.snapshot.users.find(
          (item) => item.id === membership.userId,
        );
        return {
          id: member?.id,
          email: member?.email,
          fullName: member?.fullName,
          title: member?.title,
          role: membership.role,
          joinedAt: membership.createdAt,
        };
      });
  }

  @Patch(':id/status')
  @Roles('PLATFORM_ADMIN')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationStatusDto,
  ) {
    if (id === 'org_caprov' && dto.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'The platform organization cannot be suspended',
      );
    }
    const now = new Date().toISOString();
    const updated = this.db.mutate((draft) => {
      const organization = draft.organizations.find((item) => item.id === id);
      if (!organization) {
        return null;
      }
      organization.status = dto.status;
      organization.updatedAt = now;
      if (dto.status === 'SUSPENDED') {
        organization.suspendedAt = now;
        organization.suspensionNote =
          dto.note?.trim() || 'Suspended by platform admin';
      } else {
        organization.suspendedAt = undefined;
        organization.suspensionNote = undefined;
      }
      return organization;
    });
    if (!updated) {
      return null;
    }
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action:
        dto.status === 'SUSPENDED'
          ? 'organization.suspended'
          : 'organization.reactivated',
      entityType: 'Organization',
      entityId: id,
      metadata: { note: dto.note?.trim() || undefined },
    });
    return this.toPlatformOrganizationRow(id);
  }

  @Post(':id/org-admins')
  @Roles('PLATFORM_ADMIN')
  async assignOrganizationAdmin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignOrganizationAdminDto,
  ) {
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === id,
    );
    if (!organization) {
      return null;
    }
    const email = dto.email.toLowerCase();
    const existing = this.db.snapshot.users.find(
      (item) => item.email.toLowerCase() === email,
    );
    const passwordHash = await hash(dto.password, 10);
    const now = new Date().toISOString();
    const userId = existing?.id ?? createId('usr');

    const result = this.db.mutate((draft) => {
      const targetUser = draft.users.find((item) => item.id === userId);
      if (targetUser) {
        targetUser.email = email;
        targetUser.fullName = dto.fullName;
        targetUser.title = dto.title ?? 'Organization administrator';
        targetUser.passwordHash = passwordHash;
        targetUser.updatedAt = now;
      } else {
        draft.users.push({
          id: userId,
          email,
          passwordHash,
          fullName: dto.fullName,
          title: dto.title ?? 'Organization administrator',
          createdAt: now,
          updatedAt: now,
        });
      }

      const membership = draft.memberships.find(
        (item) => item.organizationId === id && item.userId === userId,
      );
      if (membership) {
        membership.role = 'ORG_ADMIN';
      } else {
        draft.memberships.push({
          id: createId('mem'),
          organizationId: id,
          userId,
          role: 'ORG_ADMIN',
          createdAt: now,
        });
      }

      return {
        id: userId,
        email,
        fullName: dto.fullName,
        title: dto.title ?? 'Organization administrator',
        role: 'ORG_ADMIN' as const,
      };
    });

    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: existing
        ? 'organization.org_admin_reset'
        : 'organization.org_admin_created',
      entityType: 'Organization',
      entityId: id,
      metadata: { email },
    });
    return result;
  }

  @Patch('current')
  @Roles('ORG_ADMIN', 'PLATFORM_ADMIN')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationDto) {
    const updated = this.db.mutate((draft) => {
      const organization = draft.organizations.find(
        (item) => item.id === user.organizationId,
      );
      if (!organization) {
        return null;
      }
      organization.name = dto.name;
      organization.updatedAt = new Date().toISOString();
      return organization;
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: user.organizationId,
    });
    return updated;
  }

  private async createOrganizationAndAdmin(
    input: CreateOrganizationDto,
    passwordHashOverride?: string,
    requestedSlug?: string,
  ) {
    const email = input.email.toLowerCase();
    if (
      this.db.snapshot.users.some((item) => item.email.toLowerCase() === email)
    ) {
      throw new ConflictException('An account with this email already exists');
    }
    const normalizedBase = (requestedSlug ?? input.organizationName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48);
    const slug = this.ensureUniqueSlug(normalizedBase || 'org');
    const now = new Date().toISOString();
    const organizationId = createId('org');
    const userId = createId('usr');
    const passwordHash =
      passwordHashOverride ?? (await hash(input.password, 10));

    return this.db.mutate((draft) => {
      const organization = {
        id: organizationId,
        name: input.organizationName,
        slug,
        status: 'ACTIVE' as const,
        llmModelId: getPreferredDefaultLlmModelId(),
        createdAt: now,
        updatedAt: now,
      };
      const userRecord = {
        id: userId,
        email,
        passwordHash,
        fullName: input.fullName,
        title: input.title ?? 'Administrator',
        createdAt: now,
        updatedAt: now,
      };
      draft.organizations.push(organization);
      draft.users.push(userRecord);
      draft.memberships.push({
        id: createId('mem'),
        organizationId,
        userId,
        role: 'ORG_ADMIN',
        createdAt: now,
      });
      return {
        organization,
        admin: {
          id: userRecord.id,
          email: userRecord.email,
          fullName: userRecord.fullName,
          title: userRecord.title,
        },
      };
    });
  }

  private ensureUniqueSlug(base: string) {
    let attempt = base;
    let i = 1;
    while (
      this.db.snapshot.organizations.some((item) => item.slug === attempt)
    ) {
      i += 1;
      attempt = `${base}-${i}`;
    }
    return attempt;
  }

  private toPlatformOrganizationRow(id: string) {
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === id,
    );
    if (!organization) {
      return null;
    }
    const memberships = this.db.snapshot.memberships.filter(
      (item) => item.organizationId === id,
    );
    const memberCount = memberships.length;
    const orgAdminCount = memberships.filter(
      (item) => item.role === 'ORG_ADMIN',
    ).length;
    const assetCount = this.db.snapshot.assets.filter(
      (item) => item.organizationId === id,
    ).length;
    const documentCount = this.db.snapshot.documents.filter(
      (item) => item.organizationId === id,
    ).length;
    const portfolioCount = this.db.snapshot.portfolios.filter(
      (item) => item.organizationId === id,
    ).length;
    return {
      ...organization,
      memberCount,
      orgAdminCount,
      assetCount,
      documentCount,
      portfolioCount,
    };
  }
}
