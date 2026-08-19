import { cn } from '@/lib/utils';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)]/80 focus:border-[var(--ink)]/35 focus:bg-white focus:shadow-[0_0_0_3px_rgba(157,107,36,0.12)]',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)]/80 focus:border-[var(--ink)]/35 focus:bg-white focus:shadow-[0_0_0_3px_rgba(157,107,36,0.12)]',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--ink)]/35 focus:bg-white focus:shadow-[0_0_0_3px_rgba(157,107,36,0.12)]',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
