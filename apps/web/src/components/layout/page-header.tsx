import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-5', className)}>
      <div className="min-w-0 max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[clamp(1.65rem,5vw,2.55rem)] font-semibold tracking-[-0.035em] text-[var(--ink)] sm:mt-3">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-[14px] leading-6 text-[var(--muted)] sm:mt-3 sm:text-[15px] sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
