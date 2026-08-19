#!/usr/bin/env node
/**
 * Ingests dummy RE valuation packs into a running API and asserts pipeline marks.
 *
 * Usage:
 *   API_URL=http://127.0.0.1:3001/api node scripts/test-re-valuation-accuracy.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';

const CASES = [
  {
    name: 'Riverside Quay Tower',
    assetClass: 'REAL_ESTATE',
    currency: 'GBP',
    location: 'Salford Quays, Manchester',
    jurisdiction: 'England & Wales',
    expectedMark: 45_200_000,
    documents: [
      {
        name: 'Riverside Quay SPA.pdf',
        type: 'SPA',
        extractedText: `SHARE PURCHASE AGREEMENT
Purchase price: GBP 41,000,000
Ownership transferred: 100%
Property: Riverside Quay Tower, Salford Quays, Manchester M50 3SP`,
      },
      {
        name: 'Land Registry Extract — Riverside Quay.pdf',
        type: 'TITLE_DEED',
        extractedText: `HM LAND REGISTRY EXTRACT
Proprietor: Riverside Quay HoldCo Limited
Legal ownership: 100%`,
      },
      {
        name: 'Northbridge Valuation Memo — Riverside Quay.pdf',
        type: 'VALUATION_MEMO',
        extractedText: `INDEPENDENT VALUATION MEMORANDUM
As of: 31 July 2026
Market value: GBP 45,200,000
Occupancy: 91%
WALT: 6.2 years
Cap rate: 5.90%`,
      },
    ],
  },
  {
    name: 'Canal Side Logistics Park',
    assetClass: 'REAL_ESTATE',
    currency: 'EUR',
    location: 'Rotterdam, Netherlands',
    jurisdiction: 'Netherlands',
    expectedMark: 78_500_000,
    documents: [
      {
        name: 'Canal Side SPA.pdf',
        type: 'SPA',
        extractedText: `SALE AND PURCHASE AGREEMENT
Purchase price: EUR 72,250,000
Ownership transferred: 100%`,
      },
      {
        name: 'EuroLog Appraisal 2026.pdf',
        type: 'VALUATION_MEMO',
        extractedText: `VALUATION APPRAISAL
Market value: EUR 78,500,000
Occupancy: 97%
WALE: 8.1 years
As of: 30 June 2026`,
      },
    ],
  },
  {
    name: 'Bayfront Offices',
    assetClass: 'REAL_ESTATE',
    currency: 'SGD',
    location: 'Marina Bay, Singapore',
    jurisdiction: 'Singapore',
    expectedMark: 112_000_000,
    documents: [
      {
        name: 'Bayfront Offices SPA.pdf',
        type: 'SPA',
        extractedText: `SALE AND PURCHASE AGREEMENT
Purchase price: SGD 105,000,000
Ownership transferred: 100%`,
      },
      {
        name: 'Pacific Crest Valuation Memo.pdf',
        type: 'VALUATION_MEMO',
        extractedText: `INDEPENDENT VALUATION MEMORANDUM
Market value: SGD 112 million
Occupancy: 88%
WALE: 4.5 years
As of: 15 August 2026`,
      },
    ],
  },
];

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'arjun@meridian.caprov', password: 'CaprovDemo!23' },
  });
  const token = login.token;
  console.log(`Logged in as ${login.user.email}`);

  const results = [];
  for (const scenario of CASES) {
    const asset = await request('/assets', {
      method: 'POST',
      token,
      body: {
        name: scenario.name,
        assetClass: scenario.assetClass,
        currency: scenario.currency,
        location: scenario.location,
        jurisdiction: scenario.jurisdiction,
        description: `Dummy RE valuation accuracy case — expected mark ${scenario.expectedMark}`,
        status: 'ACTIVE',
      },
    });

    for (const document of scenario.documents) {
      await request('/documents', {
        method: 'POST',
        token,
        body: {
          ...document,
          assetId: asset.id,
        },
      });
    }

    await request(`/intelligence/assets/${asset.id}/run`, {
      method: 'POST',
      token,
      body: { type: 'FULL_PIPELINE' },
    });

    const valuations = await request(`/intelligence/assets/${asset.id}/valuation`, { token });
    const latest = valuations[0]?.payload;
    const ok = latest?.amount === scenario.expectedMark && latest?.currency === scenario.currency;
    results.push({
      name: scenario.name,
      assetId: asset.id,
      expected: `${scenario.currency} ${scenario.expectedMark}`,
      actual: latest ? `${latest.currency} ${latest.amount}` : 'missing',
      method: latest?.method,
      ok,
    });
  }

  console.log('\nAccuracy results');
  for (const row of results) {
    console.log(
      `${row.ok ? 'PASS' : 'FAIL'}  ${row.name}  expected=${row.expected}  actual=${row.actual}  method=${row.method ?? 'n/a'}`,
    );
  }

  const failed = results.filter((row) => !row.ok);
  if (failed.length) {
    process.exitCode = 1;
    console.error(`\n${failed.length} case(s) failed`);
  } else {
    console.log(`\nAll ${results.length} dummy RE valuation cases passed on the live API.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
