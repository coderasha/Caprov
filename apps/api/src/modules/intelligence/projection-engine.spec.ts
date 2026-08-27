import { projectValuation } from './projection-engine';
import { runLocalPipeline, answerCopilot } from './local-pipeline';

describe('forward valuation projection', () => {
  const harbourDocs = [
    {
      id: 'doc_hv_spa',
      name: 'Harbourview SPA.pdf',
      type: 'SPA' as const,
      extractedText: `Purchase price: GBP 86,400,000`,
    },
    {
      id: 'doc_hv_val',
      name: 'Knightvale Valuation Memo.pdf',
      type: 'VALUATION_MEMO' as const,
      extractedText: `Market value: GBP 92,800,000
Occupancy: 94%
WALT: 7.4 years
Cap rate: 5.35%
As of: 30 June 2026`,
    },
  ];

  it('projects 1/3/5 year marks from current DNA valuation', () => {
    const envelope = runLocalPipeline(
      {
        id: 'ast_harbourview',
        name: 'Harbourview Tower',
        assetClass: 'REAL_ESTATE',
        currency: 'GBP',
      },
      harbourDocs,
    );

    expect(envelope.projection).toBeDefined();
    expect(envelope.projection?.baseAmount).toBe(92_800_000);
    expect(envelope.projection?.horizons).toHaveLength(3);
    expect(envelope.projection?.horizons.map((item) => item.years)).toEqual([
      1, 3, 5,
    ]);

    const y1 = envelope.projection!.horizons[0]!;
    const expected = Math.round(
      92_800_000 *
        Math.pow(1 + envelope.projection!.assumptions.annualGrowthRate, 1),
    );
    expect(y1.base).toBe(expected);
    expect(y1.bear).toBeLessThan(y1.base);
    expect(y1.bull).toBeGreaterThan(y1.base);
    expect(y1.confidence).toBeGreaterThan(0.3);
  });

  it('answers copilot questions about future value', () => {
    const envelope = runLocalPipeline(
      {
        id: 'ast_harbourview',
        name: 'Harbourview Tower',
        assetClass: 'REAL_ESTATE',
        currency: 'GBP',
      },
      harbourDocs,
    );
    const reply = answerCopilot(
      'What is the projected future value?',
      envelope,
      harbourDocs,
    );
    expect(reply.briefing.title.toLowerCase()).toContain('forward');
    expect(reply.answer).toContain('92,800,000');
    expect(reply.briefing.metric).toBeTruthy();
  });

  it('requires a current mark before projecting', () => {
    const projection = projectValuation({
      assetId: 'ast_x',
      assetClass: 'REAL_ESTATE',
      currency: 'GBP',
      facts: [],
    });
    expect(projection).toBeUndefined();
  });
});
