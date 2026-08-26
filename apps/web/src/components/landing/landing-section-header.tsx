import type { ReactNode } from 'react';

type LandingSectionHeaderProps = {
  kicker: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
  action?: ReactNode;
};

export function LandingSectionHeader({
  kicker,
  title,
  description,
  align = 'left',
  className = '',
  action,
}: LandingSectionHeaderProps) {
  const centered = align === 'center';

  return (
    <div
      className={`landing-section-header ${centered ? 'landing-section-header--center mx-auto max-w-3xl text-center' : ''} ${className}`}
    >
      <div className={action ? 'flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between' : ''}>
        <div className={centered ? '' : 'max-w-2xl'}>
          <p className="landing-kicker">{kicker}</p>
          <h2 className="landing-title mt-4">{title}</h2>
          {description ? <p className="landing-lead mt-5">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
