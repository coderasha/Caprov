import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium tracking-[-0.01em] transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-[var(--ink)] text-white shadow-[0_10px_24px_rgba(10,15,26,0.18)] hover:bg-[#152033]',
        variant === 'ink' && 'bg-[var(--gold)] text-[var(--ink)] hover:bg-[#b07a2e]',
        variant === 'secondary' &&
          'border border-[var(--line)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--ink)]/20 hover:bg-white',
        variant === 'ghost' && 'text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--text)]',
        variant === 'danger' && 'bg-[var(--danger)] text-white hover:bg-[#8f1c14]',
        className,
      )}
      {...props}
    />
  );
}
