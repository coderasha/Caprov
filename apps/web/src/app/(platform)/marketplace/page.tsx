'use client';

import { BuyerMarketplace } from '@/components/marketplace/buyer-marketplace';
import { ListerMarketplace } from '@/components/marketplace/lister-marketplace';
import { useAuthStore } from '@/stores/auth-store';

function isBuyerOnly(roles: string[]) {
  return (
    roles.includes('BUYER') &&
    !roles.some((role) =>
      ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BANKER'].includes(role),
    )
  );
}

export default function MarketplacePage() {
  const roles = useAuthStore((state) => state.roles);
  if (isBuyerOnly(roles)) {
    return <BuyerMarketplace />;
  }
  return <ListerMarketplace />;
}
