import { Badge } from '@/components/ui/badge';
import { ConfidenceBar } from '@/components/ui/confidence';
import { cn } from '@/lib/utils';

export interface CopilotBriefing {
  title: string;
  headline: string;
  metric?: string;
  metricLabel?: string;
  confidence?: number;
  sections: Array<{
    title: string;
    body: string;
    kind?: 'metric' | 'detail' | 'note' | 'list';
  }>;
  disclaimer?: string;
}

export function CopilotBriefingCard({
  briefing,
  citations,
}: {
  briefing: CopilotBriefing;
  citations?: Array<{ label: string; documentId?: string }>;
}) {
  return (
    <article className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--line)]/80 bg-gradient-to-r from-[var(--ink)] to-[#182238] px-5 py-4 text-white">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">{briefing.title}</p>
        <p className="mt-2 text-sm leading-6 text-white/75">{briefing.headline}</p>
      </div>

      {briefing.metric ? (
        <div className="border-b border-[var(--line)]/80 px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {briefing.metricLabel ?? 'Key figure'}
          </p>
          <p className="mt-2 font-display text-[clamp(1.6rem,3vw,2.1rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
            {briefing.metric}
          </p>
          {briefing.confidence != null ? (
            <div className="mt-4 max-w-xs">
              <ConfidenceBar value={briefing.confidence} label="Confidence" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-0 divide-y divide-[var(--line)]/80">
        {briefing.sections.map((section) => (
          <div key={`${section.title}-${section.body.slice(0, 24)}`} className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
              {section.title}
            </p>
            {section.kind === 'list' ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink)]/85">
                {section.body.split('\n').filter(Boolean).map((item) => (
                  <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" />{item.replace(/^[-•]\s*/, '')}</li>
                ))}
              </ul>
            ) : (
              <div
                className={cn(
                  'mt-2 whitespace-pre-line text-sm leading-7 text-[var(--ink)]/85',
                  section.kind === 'note' && 'rounded-lg bg-[var(--paper)]/70 px-3 py-2.5 text-[var(--muted)]',
                  section.kind === 'metric' && 'font-display text-lg font-semibold tracking-[-0.02em]',
                )}
              >
                {section.body}
              </div>
            )}
          </div>
        ))}
      </div>

      {citations?.length ? (
        <div className="border-t border-[var(--line)]/80 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Sources</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {citations.map((citation) => (
              <Badge key={`${citation.label}-${citation.documentId ?? ''}`} tone="accent">
                {citation.label}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {briefing.disclaimer ? (
        <div className="border-t border-[var(--line)]/80 bg-[var(--paper)]/60 px-5 py-3">
          <p className="text-[11px] leading-5 text-[var(--muted)]">{briefing.disclaimer}</p>
        </div>
      ) : null}
    </article>
  );
}
