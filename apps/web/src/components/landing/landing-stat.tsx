'use client';

import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

type LandingStatProps = {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  className?: string;
};

function formatValue(value: number, decimals: number) {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

export function LandingStat({ value, suffix = '', prefix = '', label, className }: LandingStatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState('0');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;

    const decimals = Number.isInteger(value) ? 0 : 1;
    const duration = 1200;
    let frame = 0;
    let start = 0;

    const tick = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(formatValue(value * eased, decimals));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, value]);

  return (
    <div ref={ref} className={cn('landing-stat', className)}>
      <p className="landing-stat__value">
        {prefix}
        {display}
        {suffix}
      </p>
      <p className="landing-stat__label">{label}</p>
    </div>
  );
}
