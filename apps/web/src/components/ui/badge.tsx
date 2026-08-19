import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type Tone = 'muted' | 'ok' | 'warn' | 'danger' | 'accent' | 'ink';

export function Badge({
  className,
  tone = 'muted',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        tone === 'muted' && 'bg-[var(--paper-2)] text-[var(--muted)]',
        tone === 'ok' && 'bg-[var(--ok-soft)] text-[var(--ok)]',
        tone === 'warn' && 'bg-[var(--warn-soft)] text-[var(--warn)]',
        tone === 'danger' && 'bg-[var(--danger-soft)] text-[var(--danger)]',
        tone === 'accent' && 'bg-[var(--gold-soft)] text-[var(--gold)]',
        tone === 'ink' && 'bg-[var(--ink)] text-white',
        className,
      )}
      {...props}
    />
  );
}
