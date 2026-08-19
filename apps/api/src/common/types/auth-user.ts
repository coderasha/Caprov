import type { MembershipRole } from '@caprov/types';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  title?: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roles: MembershipRole[];
}
