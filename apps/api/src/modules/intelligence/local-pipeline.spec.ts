import { answerCopilot, runLocalPipeline } from './local-pipeline';
import { RE_VALUATION_CASES } from './fixtures/real-estate-valuations';

const harbourviewDocs = [
  {
    id: 'doc_hv_spa',
    name: 'Harbourview SPA.pdf',
    type: 'SPA' as const,
    extractedText: `SHARE PURCHASE AGREEMENT
Purchase price: GBP 86,400,000
Ownership transferred: 100%
Property: 14 Harbourview, Canary Wharf, London E14 5AB`,
  },
  {
    id: 'doc_hv_title',
    name: 'Land Registry Extract.pdf',
    type: 'TITLE_DEED' as const,
    extractedText: `HM LAND REGISTRY EXTRACT
Proprietor: Harbourview Tower SPV Limited
Legal ownership: 100% Harbourview Tower SPV Limited`,
  },
  {
    id: 'doc_hv_val',
    name: 'Knightvale Valuation Memo.pdf',
    type: 'VALUATION_MEMO' as const,
    extractedText: `INDEPENDENT VALUATION MEMORANDUM
As of: 30 June 2026
Market value: GBP 92,800,000
Occupancy: 94%
WALT: 7.4 years
NIA: 312,000 sq ft`,
  },
];

describe('local intelligence pipeline accuracy', () => {
  it('prefers market value over purchase price', () => {
    const envelope = runLocalPipeline(
      {
        id: 'ast_harbourview',
        name: 'Harbourview Tower',
        assetClass: 'REAL_ESTATE',
        currency: 'GBP',
        location: 'Canary Wharf, London',
        jurisdiction: 'England & Wales',
      },
      harbourviewDocs,
    );

    expect(envelope.valuation?.amount).toBe(92_800_000);
    expect(envelope.valuation?.currency).toBe('GBP');
    expect(
      envelope.facts.find((fact) => fact.key === 'purchase_price')
        ?.numericValue,
    ).toBe(86_400_000);
    expect(
      envelope.facts.find((fact) => fact.key === 'occupancy')?.numericValue,
    ).toBe(94);
    expect(
      envelope.facts.find((fact) => fact.key === 'walt')?.numericValue,
    ).toBe(7.4);
  });

  it('answers copilot with cited market value', () => {
    const envelope = runLocalPipeline(
      {
        id: 'ast_harbourview',
        name: 'Harbourview Tower',
        assetClass: 'REAL_ESTATE',
        currency: 'GBP',
      },
      harbourviewDocs,
    );
    const reply = answerCopilot(
      'What is the current value?',
      envelope,
      harbourviewDocs,
    );
    expect(reply.answer).toContain('92,800,000');
    expect(reply.citations[0]?.documentId).toBe('doc_hv_val');
  });

  describe.each(RE_VALUATION_CASES)('dummy RE pack: $name', (scenario) => {
    const docs = scenario.documents.map((document) => ({
      id: document.id,
      name: document.name,
      type: document.type,
      extractedText: document.text,
    }));

    it('marks market value over purchase price', () => {
      const envelope = runLocalPipeline(
        {
          id: scenario.id,
          name: scenario.name,
          assetClass: 'REAL_ESTATE',
          currency: scenario.currency,
          location: scenario.location,
          jurisdiction: scenario.jurisdiction,
        },
        docs,
      );

      expect(envelope.valuation?.amount).toBe(scenario.expectedMark);
      expect(envelope.valuation?.currency).toBe(scenario.currency);
      expect(
        envelope.facts.find((fact) => fact.key === 'market_value')
          ?.numericValue,
      ).toBe(scenario.expectedMark);

      if (scenario.expectedPurchase != null) {
        expect(
          envelope.facts.find((fact) => fact.key === 'purchase_price')
            ?.numericValue,
        ).toBe(scenario.expectedPurchase);
      }
      if (scenario.expectedOccupancy != null) {
        expect(
          envelope.facts.find((fact) => fact.key === 'occupancy')?.numericValue,
        ).toBe(scenario.expectedOccupancy);
      }
      if (scenario.expectedWaltOrWale) {
        expect(
          envelope.facts.find(
            (fact) => fact.key === scenario.expectedWaltOrWale!.key,
          )?.numericValue,
        ).toBe(scenario.expectedWaltOrWale.value);
      }
    });

    it('copilot cites the valuation memo for current value', () => {
      const envelope = runLocalPipeline(
        {
          id: scenario.id,
          name: scenario.name,
          assetClass: 'REAL_ESTATE',
          currency: scenario.currency,
        },
        docs,
      );
      const reply = answerCopilot('What is the current value?', envelope, docs);
      const valuationDoc = scenario.documents.find(
        (document) => document.type === 'VALUATION_MEMO',
      );
      expect(reply.answer).toContain(
        scenario.expectedMark.toLocaleString('en-GB'),
      );
      expect(reply.citations[0]?.documentId).toBe(valuationDoc?.id);
    });
  });
});
