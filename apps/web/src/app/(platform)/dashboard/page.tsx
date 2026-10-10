'use client';

import { BankerDashboard } from '@/components/dashboard/banker-dashboard';
import { BuyerDashboard } from '@/components/dashboard/buyer-dashboard';
import { OrgAdminDashboard } from '@/components/dashboard/org-admin-dashboard';
import { useAuthStore } from '@/stores/auth-store';

function isBankerOnly(roles: string[]) {
  return roles.includes('BANKER') && !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));
}

export default function DashboardPage() {
  const roles = useAuthStore((state) => state.roles);
  const bankerOnly = isBankerOnly(roles);
  const isBuyer =
    roles.includes('BUYER') &&
    !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BANKER'].includes(role));

  if (isBuyer) {
    return <BuyerDashboard />;
  }

  if (bankerOnly) {
    return <BankerDashboard />;
  }

  return <OrgAdminDashboard />;
}
