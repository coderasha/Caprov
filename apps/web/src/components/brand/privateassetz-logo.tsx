import { cn } from '@/lib/utils';
import Image from 'next/image';

const PRIVATEASSETZ_LOGO = {
  src: '/brand/privateassetz-logo.png',
  width: 2172,
  height: 724,
} as const;

/** PrivateAssetz brand image for marketing and product UI. */
export function PrivateAssetzLogo({
  className,
  priority = false,
  alt = 'PRIVATEASSETZ — Private Asset Intelligence',
}: {
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src={PRIVATEASSETZ_LOGO.src}
      alt={alt}
      width={PRIVATEASSETZ_LOGO.width}
      height={PRIVATEASSETZ_LOGO.height}
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
export function PrivateAssetzMark({
  tone: _tone = 'light',
  className,
  alt = '',
}: {
  tone?: 'light' | 'dark';
  className?: string;
  /** @deprecated Kept for call-site compatibility; image mark ignores text color. */
  markClassName?: string;
  alt?: string;
}) {
  return (
    <PrivateAssetzLogo
      alt={alt}
      className={cn('max-h-7 max-w-[1.85rem]', className)}
    />
  );
}

/**
 * Brand lockup used across shell, login, and marketing.
 */
export function PrivateAssetzWordmark({
  className,
  markClassName: _markClassName,
  tone: _tone = 'light',
  variant: _variant = 'compact',
  priority = false,
}: {
  className?: string;
  markClassName?: string;
  tone?: 'light' | 'dark';
  variant?: 'full' | 'compact';
  priority?: boolean;
}) {
  return (
    <PrivateAssetzLogo
      priority={priority}
      className={className}
    />
  );
}
