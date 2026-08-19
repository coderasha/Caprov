/**
 * Dummy real-estate valuation packs for accuracy testing.
 * Expected marks are the authoritative labels the pipeline must recover.
 */

export interface ReValuationCase {
  id: string;
  name: string;
  currency: 'GBP' | 'EUR' | 'SGD';
  location: string;
  jurisdiction: string;
  expectedMark: number;
  expectedPurchase?: number;
  expectedOccupancy?: number;
  expectedWaltOrWale?: { key: 'walt' | 'wale'; value: number };
  documents: Array<{
    id: string;
    name: string;
    type: 'SPA' | 'TITLE_DEED' | 'VALUATION_MEMO' | 'INSURANCE';
    text: string;
  }>;
}

export const RE_VALUATION_CASES: ReValuationCase[] = [
  {
    id: 'ast_riverside',
    name: 'Riverside Quay Tower',
    currency: 'GBP',
    location: 'Salford Quays, Manchester',
    jurisdiction: 'England & Wales',
    expectedMark: 45_200_000,
    expectedPurchase: 41_000_000,
    expectedOccupancy: 91,
    expectedWaltOrWale: { key: 'walt', value: 6.2 },
    documents: [
      {
        id: 'doc_rs_spa',
        name: 'Riverside Quay SPA.pdf',
        type: 'SPA',
        text: `SHARE PURCHASE AGREEMENT
Riverside Quay HoldCo Limited
Date: 12 February 2025
Buyer: Meridian Capital Partners LLP
Seller: Northern Quay Estates Ltd
Purchase price: GBP 41,000,000
Ownership transferred: 100%
Property: Riverside Quay Tower, Salford Quays, Manchester M50 3SP
Governing law: England and Wales`,
      },
      {
        id: 'doc_rs_title',
        name: 'Land Registry Extract — Riverside Quay.pdf',
        type: 'TITLE_DEED',
        text: `HM LAND REGISTRY EXTRACT
Title number: GM441902
Property: Riverside Quay Tower, Salford Quays, Manchester M50 3SP
Proprietor: Riverside Quay HoldCo Limited
Legal ownership: 100%
Charges: None recorded
Jurisdiction: England & Wales`,
      },
      {
        id: 'doc_rs_val',
        name: 'Northbridge Valuation Memo — Riverside Quay.pdf',
        type: 'VALUATION_MEMO',
        text: `INDEPENDENT VALUATION MEMORANDUM
Asset: Riverside Quay Tower
Valuer: Northbridge Advisory
As of: 31 July 2026
Market value: GBP 45,200,000
Method: Income capitalization
Cap rate: 5.90%
NIA: 168,000 sq ft
Occupancy: 91%
WALT: 6.2 years
Passing rent: GBP 2,680,000`,
      },
    ],
  },
  {
    id: 'ast_canal',
    name: 'Canal Side Logistics Park',
    currency: 'EUR',
    location: 'Rotterdam, Netherlands',
    jurisdiction: 'Netherlands',
    expectedMark: 78_500_000,
    expectedPurchase: 72_250_000,
    expectedOccupancy: 97,
    expectedWaltOrWale: { key: 'wale', value: 8.1 },
    documents: [
      {
        id: 'doc_cn_spa',
        name: 'Canal Side SPA.pdf',
        type: 'SPA',
        text: `SALE AND PURCHASE AGREEMENT
Canal Side Logistics BV
Date: 4 October 2024
Buyer: Meridian Capital Partners LLP
Seller: Benelux Industrial Partners
Purchase price: EUR 72,250,000
Ownership transferred: 100%
Property: Canal Side Logistics Park, Rotterdam
Governing law: Netherlands`,
      },
      {
        id: 'doc_cn_title',
        name: 'Kadaster Title Extract — Canal Side.pdf',
        type: 'TITLE_DEED',
        text: `KADASTER TITLE EXTRACT
Property: Canal Side Logistics Park, Rotterdam
Proprietor: Canal Side Logistics BV
Legal ownership: 100% Canal Side Logistics BV
Jurisdiction: Netherlands`,
      },
      {
        id: 'doc_cn_val',
        name: 'EuroLog Appraisal 2026.pdf',
        type: 'VALUATION_MEMO',
        text: `VALUATION APPRAISAL
Asset: Canal Side Logistics Park
Valuer: EuroLog Valuation
As of: 30 June 2026
Market value: EUR 78,500,000
Method: Discounted cash flow
Occupancy: 97%
WALE: 8.1 years
NIA: 92,400 sq m`,
      },
    ],
  },
  {
    id: 'ast_bayfront',
    name: 'Bayfront Offices',
    currency: 'SGD',
    location: 'Marina Bay, Singapore',
    jurisdiction: 'Singapore',
    expectedMark: 112_000_000,
    expectedPurchase: 105_000_000,
    expectedOccupancy: 88,
    expectedWaltOrWale: { key: 'wale', value: 4.5 },
    documents: [
      {
        id: 'doc_bf_spa',
        name: 'Bayfront Offices SPA.pdf',
        type: 'SPA',
        text: `SALE AND PURCHASE AGREEMENT
Bayfront Offices Pte Ltd
Date: 21 November 2023
Buyer: Meridian Capital Partners LLP
Seller: Harbourfront Commercial Holdings
Purchase price: SGD 105,000,000
Ownership transferred: 100%
Location: Marina Bay, Singapore
Governing law: Singapore`,
      },
      {
        id: 'doc_bf_title',
        name: 'SLA Title Extract — Bayfront.pdf',
        type: 'TITLE_DEED',
        text: `SINGAPORE LAND AUTHORITY TITLE EXTRACT
Property: Bayfront Offices, Marina Bay
Proprietor: Bayfront Offices Pte Ltd
Legal ownership: 100%
Foreign ownership approval: Granted
Jurisdiction: Singapore`,
      },
      {
        id: 'doc_bf_val',
        name: 'Pacific Crest Valuation Memo.pdf',
        type: 'VALUATION_MEMO',
        text: `INDEPENDENT VALUATION MEMORANDUM
Asset: Bayfront Offices
Valuer: Pacific Crest Advisors
As of: 15 August 2026
Market value: SGD 112 million
Method: Income capitalization
Cap rate: 4.80%
Occupancy: 88%
WALE: 4.5 years
Passing rent: SGD 5,400,000`,
      },
      {
        id: 'doc_bf_ins',
        name: 'Bayfront All-Risks Policy.pdf',
        type: 'INSURANCE',
        text: `PROPERTY INSURANCE CERTIFICATE
Insured: Bayfront Offices Pte Ltd
Declared value: SGD 120,000,000
Period: 1 January 2026 to 31 December 2026`,
      },
    ],
  },
];
