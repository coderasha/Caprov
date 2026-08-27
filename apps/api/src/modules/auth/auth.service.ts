import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthSession, RegistrationRequestReceipt } from '@caprov/types';
import { compare, hash } from 'bcryptjs';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = this.db.snapshot.users.find(
      (item) => item.email.toLowerCase() === dto.email.toLowerCase(),
    );
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = this.db.snapshot.memberships.filter(
      (item) => item.userId === user.id,
    );
    if (memberships.length === 0) {
      throw new UnauthorizedException(
        'This account is not linked to an organization',
      );
    }

    const organizationId = memberships[0]?.organizationId;
    if (!organizationId) {
      throw new UnauthorizedException(
        'This account is not linked to an organization',
      );
    }

    const session = await this.buildSession(user.id, organizationId);
    this.audit.log({
      organizationId: session.organization.id,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
    });
    return session;
  }

  async register(dto: RegisterDto): Promise<RegistrationRequestReceipt> {
    const email = dto.email.toLowerCase();
    if (
      this.db.snapshot.users.some((item) => item.email.toLowerCase() === email)
    ) {
      throw new ConflictException('An account with this email already exists');
    }
    const existingPending = this.db.snapshot.organizationAccessRequests.find(
      (item) =>
        item.requesterEmail.toLowerCase() === email &&
        item.status === 'PENDING',
    );
    if (existingPending) {
      throw new ConflictException(
        'A pending access request already exists for this email',
      );
    }
    const slugBase = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48);
    const now = new Date().toISOString();
    const passwordHash = await hash(dto.password, 10);
    const requestId = createId('req');

    this.db.mutate((draft) => {
      draft.organizationAccessRequests.unshift({
        id: requestId,
        organizationName: dto.organizationName,
        requestedSlug: slugBase || 'org',
        requesterEmail: email,
        requesterName: dto.fullName,
        requesterTitle: dto.title ?? 'Administrator',
        passwordHash,
        status: 'PENDING',
        createdAt: now,
      });
    });

    return {
      requestId,
      status: 'PENDING',
      organizationName: dto.organizationName,
      email,
      message:
        'Access request submitted. A platform admin must approve it before you can sign in.',
    };
  }

  async switchOrganization(
    user: AuthUser,
    organizationId: string,
  ): Promise<AuthSession> {
    if (!user.roles.includes('PLATFORM_ADMIN')) {
      throw new ForbiddenException('Platform admin access is required');
    }
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === organizationId,
    );
    if (!organization) {
      throw new UnauthorizedException('Organization not found');
    }
    const session = await this.buildSession(user.id, organizationId);
    this.audit.log({
      organizationId,
      actorUserId: user.id,
      action: 'auth.switch_organization',
      entityType: 'Organization',
      entityId: organizationId,
    });
    return session;
  }

  private async buildSession(
    userId: string,
    organizationId: string,
  ): Promise<AuthSession> {
    const user = this.db.snapshot.users.find((item) => item.id === userId);
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === organizationId,
    );
    const memberships = this.db.snapshot.memberships.filter(
      (item) => item.userId === userId,
    );

    if (!user || !organization || memberships.length === 0) {
      throw new UnauthorizedException(
        'This account is not linked to an organization',
      );
    }

    const scopedRoles = memberships
      .filter((item) => item.organizationId === organizationId)
      .map((item) => item.role);
    const hasPlatformAdmin = memberships.some(
      (item) => item.role === 'PLATFORM_ADMIN',
    );
    if (!scopedRoles.length && !hasPlatformAdmin) {
      throw new UnauthorizedException(
        'This account is not linked to the selected organization',
      );
    }
    if (organization.status === 'SUSPENDED' && !hasPlatformAdmin) {
      throw new ForbiddenException('Organization access is suspended');
    }

    const roles: AuthSession['roles'] = Array.from(
      new Set(
        hasPlatformAdmin
          ? (['PLATFORM_ADMIN', ...scopedRoles] as const)
          : scopedRoles,
      ),
    );

    return {
      token: await this.jwt.signAsync({
        sub: user.id,
        email: user.email,
        organizationId: organization.id,
      }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        title: user.title,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      roles,
    };
  }
}
