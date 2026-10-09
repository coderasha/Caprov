import { cn } from '@/lib/utils';
import Image from 'next/image';

type LogoTone = 'light' | 'dark';
type LogoVariant = 'full' | 'compact' | 'mark';

const ASSETS = {
  full: {
    light: { src: '/brand/caprov-logo.png', width: 887, height: 313 },
    dark: { src: '/brand/caprov-logo-on-dark.png', width: 887, height: 313 },
  },
  compact: {
    light: { src: '/brand/caprov-logo-compact.png', width: 863, height: 236 },
    dark: { src: '/brand/caprov-logo-compact-on-dark.png', width: 863, height: 236 },
  },
  mark: {
    light: { src: '/brand/caprov-mark.png', width: 320, height: 290 },
    dark: { src: '/brand/caprov-mark-on-dark.png', width: 320, height: 290 },
  },
} as const;

/** Caprov brand image. Prefer `compact` in nav bars; `full` for login/footer. */
export function CaprovLogo({
  tone = 'light',
  variant = 'full',
  className,
  priority = false,
  alt = 'CAPROV — Private Asset Intelligence',
}: {
  tone?: LogoTone;
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const asset = ASSETS[variant][tone];
  return (
    <Image
      src={asset.src}
      alt={alt}
      width={asset.width}
      height={asset.height}
      priority={priority}
      sizes="(max-width: 640px) 140px, 180px"
      className={cn(
        'block h-8 w-auto max-h-8 max-w-[10.5rem] object-contain object-left',
        className,
      )}
    />
  );
}

/** Icon-only mark for compact slots. */
export function CaprovMark({
  tone = 'light',
  className,
  alt = '',
}: {
  tone?: LogoTone;
  className?: string;
  /** @deprecated Kept for call-site compatibility; image mark ignores text color. */
  markClassName?: string;
  alt?: string;
}) {
  return (
    <CaprovLogo
      tone={tone}
      variant="mark"
      alt={alt}
      className={cn('max-h-7 max-w-[1.85rem]', className)}
    />
  );
}

/**
 * Brand lockup used across shell, login, and marketing.
 * Prefer `tone` for background contrast; `variant="compact"` for headers.
 */
export function CaprovWordmark({
  className,
  markClassName: _markClassName,
  tone = 'light',
  variant = 'compact',
  priority = false,
}: {
  className?: string;
  markClassName?: string;
  tone?: LogoTone;
  variant?: Exclude<LogoVariant, 'mark'>;
  priority?: boolean;
}) {
  return (
    <CaprovLogo
      tone={tone}
      variant={variant}
      priority={priority}
      className={className}
    />
  );
}
