'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type FactRow = {
  id: string;
  key: string;
  label?: string;
  value: string;
  fragment?: string;
};

const PRIORITY = [
  'market_value',
  'nav',
  'purchase_price',
  'legal_ownership',
  'proprietor',
  'location',
  'occupancy',
  'walt',
  'wale',
  'nia',
  'cap_rate',
  'passing_rent',
  'commitment',
  'called_capital',
  'current_yield',
  'serial_number',
  'hectares',
  'airframe_hours',
];

function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sortFacts(facts: FactRow[]): FactRow[] {
  return [...facts].sort((a, b) => {
    const left = PRIORITY.indexOf(a.key);
    const right = PRIORITY.indexOf(b.key);
    if (left !== -1 || right !== -1) {
      if (left === -1) return 1;
      if (right === -1) return -1;
      return left - right;
    }
    return (a.label ?? a.key).localeCompare(b.label ?? b.key);
  });
}

export function FactSummaryTable({
  title = 'Key extracted details',
  facts,
  emptyMessage = 'No structured details extracted yet.',
}: {
  title?: string;
  facts: FactRow[];
  emptyMessage?: string;
}) {
  const rows = sortFacts(facts);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)]/80 px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {rows.length ? (
        <div className="caprov-scroll">
          <table className="caprov-table w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3.5 font-medium sm:px-5">Field</th>
                <th className="px-3 py-3.5 font-medium">Value</th>
                <th className="px-4 py-3.5 font-medium sm:px-5">Source excerpt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fact) => (
                <tr key={fact.id} className="border-t border-[var(--line)]/80 align-top">
                  <td className="px-4 py-4 sm:px-5">
                    <p className="font-medium text-[var(--ink)]">{fact.label ?? humanizeKey(fact.key)}</p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">{fact.key}</p>
                  </td>
                  <td className="px-3 py-4">
                    <Badge tone="accent">{fact.value}</Badge>
                  </td>
                  <td className="px-4 py-4 text-[var(--muted)] sm:px-5">
                    {fact.fragment ? fact.fragment : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-6 text-sm text-[var(--muted)]">{emptyMessage}</div>
      )}
    </Card>
  );
}
