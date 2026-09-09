import {
  extractFactsAccurate,
  normalizeExtractionText,
  parseAmount,
} from './extraction-accuracy';
import { runLocalPipeline } from './local-pipeline';

describe('extraction accuracy optimizations', () => {
  it('normalizes OCR noise before matching', () => {
    const text = normalizeExtractionText(
      'Market value:\u00a0GBP 12,000,000\u2014as of',
    );
    expect(text).toContain('GBP 12,000,000');
    expect(text).toContain('-');
  });

  it('parses million suffixes without false multipliers', () => {
    expect(parseAmount('SGD 112 million')?.amount).toBe(112_000_000);
    expect(parseAmount('GBP 92.8m')?.amount).toBe(92_800_000);
    expect(parseAmount('₹12,50,00,000')?.amount).toBe(125_000_000);
    expect(parseAmount('₹12.5 crore')?.currency).toBe('INR');
    expect(parseAmount('as at 30 September 2026')).toBeNull();
  });

  it('prefers valuation memo over insurance declared value', () => {
    const facts = extractFactsAccurate([
      {
        id: 'doc_ins',
        name: 'Insurance.pdf',
        type: 'INSURANCE',
        extractedText:
          'PROPERTY INSURANCE\nDeclared value: GBP 120,000,000\nInsured value: GBP 120,000,000',
      },
      {
        id: 'doc_val',
        name: 'Appraisal.pdf',
        type: 'VALUATION_MEMO',
        extractedText:
          'INDEPENDENT VALUATION\nAppraised value: GBP 45,200,000\nAs of: 31 July 2026',
      },
      {
        id: 'doc_spa',
        name: 'SPA.pdf',
        type: 'SPA',
        extractedText: 'Purchase price: GBP 41,000,000',
      },
    ]);

    expect(
      facts.find((fact) => fact.key === 'market_value')?.numericValue,
    ).toBe(45_200_000);
    expect(
      facts.find((fact) => fact.key === 'purchase_price')?.numericValue,
    ).toBe(41_000_000);
  });

  it('rejects replacement cost and book value as market marks', () => {
    const facts = extractFactsAccurate([
      {
        id: 'doc_rep',
        name: 'Insurance schedule.pdf',
        type: 'OTHER',
        extractedText:
          'Replacement cost: GBP 130,000,000\nBook value: GBP 38,000,000',
      },
      {
        id: 'doc_val',
        name: 'Memo.pdf',
        type: 'VALUATION_MEMO',
        extractedText:
          'Fair market value: GBP 45,200,000\nValuation date: 31 July 2026',
      },
    ]);
    expect(
      facts.find((fact) => fact.key === 'market_value')?.numericValue,
    ).toBe(45_200_000);
  });

  it('skips NAV statement headings without a nav: amount', () => {
    const facts = extractFactsAccurate([
      {
        id: 'doc_nav',
        name: 'Cover.pdf',
        type: 'FINANCIAL_STATEMENT',
        extractedText:
          'NAV STATEMENT\nAurelia Fund\nLatest NAV: USD 48,250,000\nAs of: 30 June 2026',
      },
    ]);
    expect(facts.find((fact) => fact.key === 'nav')?.numericValue).toBe(
      48_250_000,
    );
  });

  it('prefers the more recent valuation memo by as-of date', () => {
    const facts = extractFactsAccurate([
      {
        id: 'doc_old',
        name: 'Old.pdf',
        type: 'VALUATION_MEMO',
        extractedText: 'Market value: GBP 40,000,000\nAs of: 1 January 2024',
      },
      {
        id: 'doc_new',
        name: 'New.pdf',
        type: 'VALUATION_MEMO',
        extractedText:
          'Market value: GBP 52,000,000\nValuation date: 15 August 2026',
      },
    ]);
    expect(
      facts.find((fact) => fact.key === 'market_value')?.numericValue,
    ).toBe(52_000_000);
  });

  it('consensus-boosts agreeing marks across sources', () => {
    const facts = extractFactsAccurate([
      {
        id: 'doc_a',
        name: 'Val A.pdf',
        type: 'VALUATION_MEMO',
        extractedText: 'Market value: GBP 50,000,000\nAs of: 1 June 2026',
      },
      {
        id: 'doc_b',
        name: 'Val B.pdf',
        type: 'VALUATION_MEMO',
        extractedText: 'Fair value: GBP 50,100,000\nAs of: 15 June 2026',
      },
    ]);
    const market = facts.find((fact) => fact.key === 'market_value');
    expect(market?.confidence).toBeGreaterThanOrEqual(0.99);
    expect(market?.provenance.length).toBeGreaterThan(1);
  });

  it('uses open market value synonym for RE packs', () => {
    const envelope = runLocalPipeline(
      {
        id: 'ast_omv',
        name: 'OMV Tower',
        assetClass: 'REAL_ESTATE',
        currency: 'GBP',
      },
      [
        {
          id: 'doc_omv',
          name: 'OMV Memo.pdf',
          type: 'VALUATION_MEMO',
          extractedText:
            'Open market value: GBP 33,250,000\nOccupancy: 96%\nWALT: 5.5 years',
        },
      ],
    );
    expect(envelope.valuation?.amount).toBe(33_250_000);
    expect(envelope.projection).toBeDefined();
  });
});
