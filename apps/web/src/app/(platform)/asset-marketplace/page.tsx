'use client';

import { OrgAssetMarketplace } from '@/components/marketplace/org-asset-marketplace';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function isOrgOperator(roles: string[]) {
  return roles.some((role) =>
    ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'COMPLIANCE'].includes(role),
  );
}

export default function AssetMarketplacePage() {
  const roles = useAuthStore((state) => state.roles);
  const router = useRouter();
  const allowed = isOrgOperator(roles);

  useEffect(() => {
    if (!allowed) {
      router.replace('/marketplace');
    }
  }, [allowed, router]);

  if (!allowed) {
    return (
      <p className="mx-auto max-w-3xl p-6 text-sm text-[var(--muted)]">
        Redirecting to marketplace…
      </p>
    );
  }

  return <OrgAssetMarketplace />;
}
