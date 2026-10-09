'use client';

import { cn } from '@/lib/utils';

export function Sparkline({
  points,
  className,
  stroke = 'var(--gold)',
}: {
  points: number[];
  className?: string;
  stroke?: string;
}) {
  const width = 88;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('overflow-visible', className)} aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MiniBars({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn('flex h-7 items-end gap-1', className)} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className="w-1.5 rounded-sm bg-[var(--gold)]/80"
          style={{ height: `${Math.max(18, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function AreaTrendChart({
  series,
  labels,
  className,
}: {
  series: number[];
  labels: string[];
  className?: string;
}) {
  const width = 640;
  const height = 220;
  const padX = 12;
  const padY = 18;
  const min = 0;
  const max = Math.max(...series, 1) * 1.08;
  const coords = series.map((value, index) => {
    const x = padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - ((value - min) / (max - min)) * (height - padY * 2);
    return { x, y };
  });
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  const area = `${line} L${coords.at(-1)?.x ?? 0} ${height - padY} L${coords[0]?.x ?? 0} ${height - padY} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: height - padY - ratio * (height - padY * 2),
    label: formatAxisMoney(max * ratio),
  }));

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label="Portfolio value trend">
        <defs>
          <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a46a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#c9a46a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick.label}>
            <line x1={padX} x2={width - padX} y1={tick.y} y2={tick.y} stroke="rgba(10,15,26,0.06)" />
            <text x={width - 4} y={tick.y - 4} textAnchor="end" fontSize="10" fill="#8a8378">
              {tick.label}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#dash-area)" />
        <path d={line} fill="none" stroke="#b8893f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point, index) =>
          index === coords.length - 1 ? (
            <circle key={index} cx={point.x} cy={point.y} r="4.5" fill="#b8893f" stroke="#fff" strokeWidth="2" />
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[11px] text-[var(--muted)]">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

export function AllocationDonut({
  segments,
  centerLabel,
  className,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  className?: string;
}) {
  const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 54;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-col gap-5 sm:flex-row sm:items-center', className)}>
      <div className="relative mx-auto h-[148px] w-[148px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#efeae1" strokeWidth={stroke} />
          {segments.map((segment) => {
            const length = (segment.value / total) * circumference;
            const circle = (
              <circle
                key={segment.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Total</p>
            <p className="mt-0.5 font-display text-lg font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {centerLabel}
            </p>
          </div>
        </div>
      </div>
      <ul className="grid flex-1 gap-2.5">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="truncate text-[var(--ink)]">{segment.label}</span>
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              {((segment.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAxisMoney(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(0)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value <= 0) return '$0';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
