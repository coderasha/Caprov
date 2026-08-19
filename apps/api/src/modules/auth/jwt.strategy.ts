import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { MembershipRole } from '@caprov/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly db: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'caprov-dev-secret-change-me',
    });
  }

  validate(payload: JwtPayload): AuthUser {
    const user = this.db.snapshot.users.find((item) => item.id === payload.sub);
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === payload.organizationId,
    );
    const memberships = this.db.snapshot.memberships.filter((item) => item.userId === payload.sub);
    const scopedMemberships = memberships.filter(
      (item) => item.organizationId === payload.organizationId,
    );
    const hasPlatformAdmin = memberships.some((item) => item.role === 'PLATFORM_ADMIN');

    if (!user || !organization || (!scopedMemberships.length && !hasPlatformAdmin)) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (organization.status === 'SUSPENDED' && !hasPlatformAdmin) {
      throw new UnauthorizedException('Organization access is suspended');
    }

    const roles = Array.from(
      new Set<MembershipRole>([
        ...(hasPlatformAdmin ? (['PLATFORM_ADMIN'] as MembershipRole[]) : []),
        ...scopedMemberships.map((item) => item.role),
      ]),
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      title: user.title,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      roles,
    };
  }
}
