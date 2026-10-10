'use client';

import { OrgPortfolios } from '@/components/portfolios/org-portfolios';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { assetClassLabel, money, riskTone } from '@/lib/format';
import type { PortfolioRow } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

export default function PortfoliosPage() {
  const roles = useAuthStore((state) => state.roles);
  const isAnalyst =
    roles.includes('ANALYST') &&
    !roles.some((role) => ['ORG_ADMIN', 'PLATFORM_ADMIN'].includes(role));

  if (!isAnalyst) {
    return <OrgPortfolios />;
  }

  return <AnalystPortfolios />;
}

function AnalystPortfolios() {
  const query = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => (await api.get<PortfolioRow[]>('/portfolios')).data,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Portfolios"
        title="My portfolio"
        description="Your assigned holdings and their latest marks."
      />
      <div className="grid gap-4">
        {(query.data ?? []).map((portfolio) => {
          const value = portfolio.holdings.reduce(
            (sum, holding) => sum + (holding.valuation?.payload.amount ?? 0),
            0,
          );
          return (
            <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
              <Card className="p-6 transition hover:border-[var(--ink)]/20 hover:bg-white/70">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                      {portfolio.name}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">{portfolio.description}</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {money(value, portfolio.baseCurrency)}
                  </p>
                </div>
                <p className="mt-4 text-xs text-[var(--muted)]">
                  {portfolio.holdingCount} holdings
                </p>
                {portfolio.holdings.length ? (
                  <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4">
                    {portfolio.holdings.map((holding) => (
                      <div
                        key={holding.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {holding.asset?.name ?? holding.assetId}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            {holding.asset
                              ? `${assetClassLabel[holding.asset.assetClass]}${
                                  holding.asset.location ? ` · ${holding.asset.location}` : ''
                                }`
                              : 'Investment holding'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="tabular-nums">{holding.weight ?? 0}%</span>
                          <Badge tone={riskTone(holding.risk?.payload.rating)}>
                            {holding.risk?.payload.rating ?? 'n/a'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
