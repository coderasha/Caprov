import type { MembershipRole } from '@caprov/types';

export const AUTH_SCOPES = {
  platformAdmin: 'platform:admin',
  organizationAdmin: 'organization:admin',
  assetRead: 'asset:read',
  assetWrite: 'asset:write',
  documentRead: 'document:read',
  documentWrite: 'document:write',
  intelligenceRead: 'intelligence:read',
  intelligenceWrite: 'intelligence:write',
  portfolioRead: 'portfolio:read',
  portfolioWrite: 'portfolio:write',
  auditRead: 'audit:read',
} as const;

export const ROLE_SCOPES: Record<MembershipRole, string[]> = {
  PLATFORM_ADMIN: Object.values(AUTH_SCOPES),
  ORG_ADMIN: [
    AUTH_SCOPES.organizationAdmin,
    AUTH_SCOPES.assetRead,
    AUTH_SCOPES.assetWrite,
    AUTH_SCOPES.documentRead,
    AUTH_SCOPES.documentWrite,
    AUTH_SCOPES.intelligenceRead,
    AUTH_SCOPES.intelligenceWrite,
    AUTH_SCOPES.portfolioRead,
    AUTH_SCOPES.portfolioWrite,
    AUTH_SCOPES.auditRead,
  ],
  ANALYST: [
    AUTH_SCOPES.assetRead,
    AUTH_SCOPES.assetWrite,
    AUTH_SCOPES.documentRead,
    AUTH_SCOPES.documentWrite,
    AUTH_SCOPES.intelligenceRead,
    AUTH_SCOPES.intelligenceWrite,
    AUTH_SCOPES.portfolioRead,
    AUTH_SCOPES.portfolioWrite,
    AUTH_SCOPES.auditRead,
  ],
  COMPLIANCE: [
    AUTH_SCOPES.assetRead,
    AUTH_SCOPES.documentRead,
    AUTH_SCOPES.intelligenceRead,
    AUTH_SCOPES.portfolioRead,
    AUTH_SCOPES.auditRead,
  ],
  VIEWER: [
    AUTH_SCOPES.assetRead,
    AUTH_SCOPES.documentRead,
    AUTH_SCOPES.intelligenceRead,
    AUTH_SCOPES.portfolioRead,
    AUTH_SCOPES.auditRead,
  ],
};

export function canWriteAssets(roles: MembershipRole[]): boolean {
  return roles.some((role) => ROLE_SCOPES[role].includes(AUTH_SCOPES.assetWrite));
}
