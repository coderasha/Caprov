import { cn } from '@/lib/utils';

export function CaprovMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect width="40" height="40" rx="10" fill="currentColor" opacity="0.08" />
      <path
        d="M8 28V12h8.2c4.6 0 7.4 2.5 7.4 6.4 0 3.9-2.8 6.4-7.4 6.4H12.6V28H8Zm4.6-7.4h3.3c2.1 0 3.3-1 3.3-2.6s-1.2-2.6-3.3-2.6h-3.3v5.2Z"
        fill="currentColor"
      />
      <path
        d="M25.2 28 31.8 12h4.4L29.4 28h-4.2Z"
        fill="currentColor"
        opacity="0.55"
      />
      <circle cx="30.8" cy="28" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function CaprovWordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-[0.35em]', className)}>
      <CaprovMark className={cn('h-[0.92em] w-[0.92em]', markClassName)} />
      <span className="tracking-[-0.04em]">CAPROV</span>
    </span>
  );
}
