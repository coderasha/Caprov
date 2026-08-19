'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AuditRow } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

export default function AuditPage() {
  const query = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<AuditRow[]>('/audit?limit=200')).data,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Audit"
        title="Activity trail"
        description="Authoritative actions in the core platform — logins, document ingest, DNA runs and portfolio changes."
      />
      <Card className="overflow-hidden">
        <div className="caprov-scroll">
        <table className="caprov-table w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3.5 font-medium sm:px-6">When</th>
              <th className="px-3 py-3.5 font-medium">Action</th>
              <th className="px-4 py-3.5 font-medium sm:px-6">Entity</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((event) => (
              <tr key={event.id} className="border-t border-[var(--line)]/80">
                <td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(event.createdAt)}</td>
                <td className="px-3 py-4 font-medium">{event.action.replaceAll('.', ' ')}</td>
                <td className="break-anywhere px-4 py-4 text-[var(--muted)] sm:px-6">
                  {event.entityType}
                  {event.entityId ? ` · ${event.entityId}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
