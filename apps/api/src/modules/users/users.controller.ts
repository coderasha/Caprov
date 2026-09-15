import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { hash } from 'bcryptjs';
import type { MembershipRole } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['ORG_ADMIN', 'ANALYST', 'BANKER', 'COMPLIANCE', 'VIEWER'])
  role!: MembershipRole;

  @IsOptional()
  @IsString()
  title?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    const memberships = this.db.snapshot.memberships.filter(
      (item) => item.organizationId === user.organizationId,
    );
    return memberships.map((membership) => {
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

  @Post()
  @Roles('ORG_ADMIN', 'PLATFORM_ADMIN')
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    const email = dto.email.toLowerCase();
    const existing = this.db.snapshot.users.find(
      (item) => item.email.toLowerCase() === email,
    );
    if (existing) {
      const alreadyMember = this.db.snapshot.memberships.some(
        (item) =>
          item.userId === existing.id &&
          item.organizationId === user.organizationId,
      );
      if (alreadyMember) {
        return {
          id: existing.id,
          email: existing.email,
          fullName: existing.fullName,
          role: dto.role,
        };
      }
    }
    const now = new Date().toISOString();
    const userId = existing?.id ?? createId('usr');
    const passwordHash = await hash(dto.password, 10);
    this.db.mutate((draft) => {
      if (!existing) {
        draft.users.push({
          id: userId,
          email,
          passwordHash,
          fullName: dto.fullName,
          title: dto.title,
          createdAt: now,
          updatedAt: now,
        });
      }
      draft.memberships.push({
        id: createId('mem'),
        organizationId: user.organizationId,
        userId,
        role: dto.role,
        createdAt: now,
      });
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'user.invited',
      entityType: 'User',
      entityId: userId,
      metadata: { role: dto.role },
    });
    return { id: userId, email, fullName: dto.fullName, role: dto.role };
  }
}
