import { confidenceLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ConfidenceBar({ value, label }: { value?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{label ?? 'Confidence'}</span>
        <span className="font-mono">{confidenceLabel(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-2)]">
        <div
          className={cn(
            'h-full rounded-full',
            pct >= 80 ? 'bg-[var(--ok)]' : pct >= 60 ? 'bg-[var(--gold)]' : 'bg-[var(--danger)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
