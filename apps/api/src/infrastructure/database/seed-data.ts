import { hashSync } from 'bcryptjs';
import type {
  AssetDnaEnvelope,
  DnaEntity,
  DnaFact,
  DnaRelationship,
  DnaTimelineEvent,
  RiskSummary,
  ValuationSummary,
} from '@caprov/types';
import type { CaprovData, DocumentRecord } from './models';
import { getPreferredDefaultLlmModelId } from '../../modules/intelligence/llm-catalog';

const DEMO_PASSWORD = 'CaprovDemo!23';
const passwordHash = hashSync(DEMO_PASSWORD, 10);
const now = '2026-08-10T10:00:00.000Z';

const orgId = 'org_meridian';
const platformOrgId = 'org_caprov';
const elenaId = 'usr_elena';
const arjunId = 'usr_arjun';
const sofiaId = 'usr_sofia';
const adminId = 'usr_caprov_admin';
const platformAdminEmail = 'priya@caprov.io';
const platformAdminName = 'Priya Nair';
const defaultLlmModelId = getPreferredDefaultLlmModelId();

const harbourId = 'ast_harbourview';
const aureliaId = 'ast_aurelia';
const soleilId = 'ast_soleil';
const nimbusId = 'ast_nimbus';
const klineId = 'ast_kline';
const cedarId = 'ast_cedar';

function fact(
  id: string,
  key: string,
  label: string,
  value: string,
  confidence: number,
  documentId: string,
  extra: Partial<DnaFact> = {},
): DnaFact {
  return {
    id,
    key,
    label,
    value,
    confidence,
    provenance: [
      {
        sourceDocumentId: documentId,
        sourceFragment: extra.provenance?.[0]?.sourceFragment ?? value,
        confidence,
        observedAt: now,
      },
    ],
    ...extra,
  };
}

function entity(
  id: string,
  name: string,
  type: DnaEntity['type'],
  confidence: number,
  aliases: string[] = [],
): DnaEntity {
  return { id, name, type, canonicalName: name, aliases, confidence };
}

function rel(
  id: string,
  fromEntityId: string,
  toEntityId: string,
  type: string,
  confidence: number,
  sourceDocumentId?: string,
): DnaRelationship {
  return { id, fromEntityId, toEntityId, type, confidence, sourceDocumentId };
}

function event(
  id: string,
  date: string,
  title: string,
  description: string,
  category: DnaTimelineEvent['category'],
  confidence: number,
  sourceDocumentId?: string,
): DnaTimelineEvent {
  return { id, date, title, description, category, confidence, sourceDocumentId };
}

type SeedDocument = Omit<
  DocumentRecord,
  | 'groupKey'
  | 'version'
  | 'isCurrent'
  | 'previousDocumentId'
  | 'previousVersionHash'
  | 'documentHash'
  | 'hashAlgorithm'
  | 'offChainUri'
  | 'anchorStatus'
  | 'anchorMode'
  | 'anchorChainId'
  | 'anchorChainName'
  | 'anchorContractAddress'
  | 'anchorTxHash'
  | 'anchorExplorerUrl'
  | 'anchoredAt'
  | 'blockchainReference'
>;

function withDocumentVersioning(documents: SeedDocument[]): DocumentRecord[] {
  return documents.map((document) => ({
    ...document,
    groupKey: document.assetId ? `${document.assetId}:${document.type}` : `standalone:${document.id}`,
    version: 1,
    isCurrent: true,
    hashAlgorithm: 'sha256',
    offChainUri: `caprov://storage/${document.storageKey}`,
    anchorStatus: 'NOT_APPLICABLE',
  }));
}

const harbourValuation: ValuationSummary = {
  amount: 92_800_000,
  currency: 'GBP',
  method: 'Income capitalization with recent comparable evidence',
  asOf: '2026-06-30T00:00:00.000Z',
  low: 88_500_000,
  high: 97_200_000,
  confidence: 0.86,
  notes: [
    'Passing rent and WALT support a 5.35% cap rate.',
    'Valuer applied a 4% vacancy allowance versus 6% in-place.',
  ],
};

const harbourRisk: RiskSummary = {
  overall: 34,
  rating: 'MODERATE',
  confidence: 0.84,
  flags: ['Single-asset concentration in Canary Wharf', 'Lease expiry cluster in 2029'],
  dimensions: [
    {
      key: 'ownership_clarity',
      label: 'Ownership clarity',
      score: 18,
      rationale: '100% legal title is documented through the SPA and land registry extract.',
    },
    {
      key: 'document_coverage',
      label: 'Document coverage',
      score: 22,
      rationale: 'Title, SPA, valuation, insurance and KYC packs are present and current.',
    },
    {
      key: 'income_durability',
      label: 'Income durability',
      score: 41,
      rationale: 'Occupancy is 94% but three major leases expire within 36 months.',
    },
    {
      key: 'jurisdiction',
      label: 'Jurisdiction & legal',
      score: 28,
      rationale: 'England & Wales title is clean; no material litigation disclosed.',
    },
  ],
};

const harbourDna: AssetDnaEnvelope = {
  assetId: harbourId,
  version: 3,
  generatedAt: now,
  summary:
    'Harbourview Tower is a Class A Canary Wharf office owned 100% by Meridian via Harbourview Tower SPV Limited. Current independent valuation is GBP 92.8m with strong document provenance and moderate lease-roll risk.',
  sourceDocumentIds: ['doc_hv_spa', 'doc_hv_title', 'doc_hv_val', 'doc_hv_ins', 'doc_hv_kyc'],
  confidence: { overall: 0.87, coverage: 0.91, provenance: 0.89 },
  facts: [
    fact('f_hv_price', 'purchase_price', 'Purchase price', 'GBP 86,400,000', 0.96, 'doc_hv_spa', {
      numericValue: 86_400_000,
      currency: 'GBP',
    }),
    fact('f_hv_val', 'market_value', 'Market value', 'GBP 92,800,000', 0.9, 'doc_hv_val', {
      numericValue: 92_800_000,
      currency: 'GBP',
    }),
    fact('f_hv_own', 'legal_ownership', 'Legal ownership', '100% Harbourview Tower SPV Limited', 0.97, 'doc_hv_title'),
    fact('f_hv_nia', 'nia', 'Net internal area', '312,000 sq ft', 0.88, 'doc_hv_val', {
      numericValue: 312000,
      unit: 'sq_ft',
    }),
    fact('f_hv_occ', 'occupancy', 'Occupancy', '94%', 0.85, 'doc_hv_val', { numericValue: 94, unit: '%' }),
    fact('f_hv_walt', 'walt', 'WALT', '7.4 years', 0.84, 'doc_hv_val', { numericValue: 7.4, unit: 'years' }),
    fact('f_hv_loc', 'location', 'Location', '14 Harbourview, Canary Wharf, London E14 5AB', 0.95, 'doc_hv_title'),
  ],
  entities: [
    entity('e_meridian', 'Meridian Capital Partners LLP', 'ORGANIZATION', 0.98, ['Meridian']),
    entity('e_hv_spv', 'Harbourview Tower SPV Limited', 'ORGANIZATION', 0.96),
    entity('e_northbridge', 'Northbridge Estates Ltd', 'ORGANIZATION', 0.9),
    entity('e_hv_asset', 'Harbourview Tower', 'ASSET', 0.99),
    entity('e_london', 'Canary Wharf, London', 'LOCATION', 0.93),
  ],
  relationships: [
    rel('r_hv_owns', 'e_meridian', 'e_hv_spv', 'CONTROLS', 0.95, 'doc_hv_kyc'),
    rel('r_hv_spv_asset', 'e_hv_spv', 'e_hv_asset', 'LEGAL_OWNER_OF', 0.97, 'doc_hv_title'),
    rel('r_hv_sold', 'e_northbridge', 'e_hv_spv', 'SOLD_TO', 0.92, 'doc_hv_spa'),
    rel('r_hv_located', 'e_hv_asset', 'e_london', 'LOCATED_IN', 0.95, 'doc_hv_title'),
  ],
  timeline: [
    event('t_hv_acq', '2024-03-18', 'Acquisition completed', 'Meridian acquired 100% of Harbourview Tower SPV Limited for GBP 86.4m.', 'OWNERSHIP', 0.96, 'doc_hv_spa'),
    event('t_hv_ins', '2025-09-01', 'Insurance renewed', 'All-risks property policy renewed with a GBP 95m declared value.', 'LEGAL', 0.82, 'doc_hv_ins'),
    event('t_hv_val', '2026-06-30', 'Independent valuation', 'Knightvale valued the asset at GBP 92.8m on an income capitalization basis.', 'VALUATION', 0.9, 'doc_hv_val'),
  ],
  valuation: harbourValuation,
  risk: harbourRisk,
};

const aureliaValuation: ValuationSummary = {
  amount: 48_250_000,
  currency: 'USD',
  method: 'NAV plus expected credit loss overlay',
  asOf: '2026-06-30T00:00:00.000Z',
  low: 46_100_000,
  high: 50_400_000,
  confidence: 0.81,
  notes: ['Fund NAV is USD 48.25m after ECL of 1.8%.', 'Two watchlist names drive most residual uncertainty.'],
};

const aureliaRisk: RiskSummary = {
  overall: 46,
  rating: 'ELEVATED',
  confidence: 0.8,
  flags: ['Watchlist credits in healthcare services', 'Quarterly reporting lag'],
  dimensions: [
    { key: 'credit_quality', label: 'Credit quality', score: 52, rationale: 'Weighted average internal rating is BB- with 8% watchlist.' },
    { key: 'document_coverage', label: 'Document coverage', score: 31, rationale: 'LPA, latest NAV pack and KYC are on file.' },
    { key: 'liquidity', label: 'Liquidity', score: 58, rationale: 'Closed-end fund with 2029 harvest window.' },
    { key: 'governance', label: 'Governance', score: 29, rationale: 'Independent GP with standard LPAC rights.' },
  ],
};

const aureliaDna: AssetDnaEnvelope = {
  assetId: aureliaId,
  version: 2,
  generatedAt: now,
  summary:
    'Aurelia Private Credit Fund III is a USD 48.25m NAV position in senior secured mid-market loans. Document coverage is solid; credit watchlist concentration is the primary risk driver.',
  sourceDocumentIds: ['doc_au_lpa', 'doc_au_nav', 'doc_au_kyc'],
  confidence: { overall: 0.81, coverage: 0.78, provenance: 0.86 },
  facts: [
    fact('f_au_nav', 'nav', 'Latest NAV', 'USD 48,250,000', 0.9, 'doc_au_nav', { numericValue: 48_250_000, currency: 'USD' }),
    fact('f_au_commit', 'commitment', 'Commitment', 'USD 50,000,000', 0.94, 'doc_au_lpa', { numericValue: 50_000_000, currency: 'USD' }),
    fact('f_au_called', 'called_capital', 'Called capital', '96%', 0.88, 'doc_au_nav', { numericValue: 96, unit: '%' }),
    fact('f_au_yield', 'current_yield', 'Current yield', '11.4%', 0.8, 'doc_au_nav', { numericValue: 11.4, unit: '%' }),
  ],
  entities: [
    entity('e_aurelia_gp', 'Aurelia Credit Partners LP', 'ORGANIZATION', 0.93),
    entity('e_aurelia_fund', 'Aurelia Private Credit Fund III', 'INSTRUMENT', 0.95),
    entity('e_meridian', 'Meridian Capital Partners LLP', 'ORGANIZATION', 0.98),
  ],
  relationships: [
    rel('r_au_lp', 'e_meridian', 'e_aurelia_fund', 'LIMITED_PARTNER_IN', 0.92, 'doc_au_lpa'),
    rel('r_au_gp', 'e_aurelia_gp', 'e_aurelia_fund', 'GENERAL_PARTNER_OF', 0.9, 'doc_au_lpa'),
  ],
  timeline: [
    event('t_au_close', '2023-11-02', 'Final close', 'Fund III reached final close at USD 1.1bn.', 'LEGAL', 0.9, 'doc_au_lpa'),
    event('t_au_nav', '2026-06-30', 'Q2 NAV issued', 'Meridian commitment marked at USD 48.25m.', 'VALUATION', 0.88, 'doc_au_nav'),
  ],
  valuation: aureliaValuation,
  risk: aureliaRisk,
};

const soleilValuation: ValuationSummary = {
  amount: 18_600_000,
  currency: 'EUR',
  method: 'Comparable vineyard transactions with production overlay',
  asOf: '2026-05-15T00:00:00.000Z',
  low: 17_200_000,
  high: 20_100_000,
  confidence: 0.74,
  notes: ['Production vintage volatility remains the key valuation swing factor.'],
};

const soleilRisk: RiskSummary = {
  overall: 39,
  rating: 'MODERATE',
  confidence: 0.76,
  flags: ['Climate / vintage concentration', 'Operating partner key-person'],
  dimensions: [
    { key: 'title', label: 'Title & appellation', score: 21, rationale: 'AOC Saint-Émilion title is registered and unencumbered.' },
    { key: 'climate', label: 'Climate & production', score: 57, rationale: 'Two weaker vintages in five years affect cash yield.' },
    { key: 'document_coverage', label: 'Document coverage', score: 33, rationale: 'Deed, valuation and insurance are present.' },
  ],
};

const soleilDna: AssetDnaEnvelope = {
  assetId: soleilId,
  version: 2,
  generatedAt: now,
  summary:
    'Domaine Soleil is a 42-hectare Saint-Émilion estate acquired in 2022. Independent value is EUR 18.6m with clean title and moderate climate/operating risk.',
  sourceDocumentIds: ['doc_so_deed', 'doc_so_val', 'doc_so_ins'],
  confidence: { overall: 0.78, coverage: 0.8, provenance: 0.83 },
  facts: [
    fact('f_so_val', 'market_value', 'Market value', 'EUR 18,600,000', 0.8, 'doc_so_val', { numericValue: 18_600_000, currency: 'EUR' }),
    fact('f_so_ha', 'hectares', 'Estate size', '42 hectares', 0.92, 'doc_so_deed', { numericValue: 42, unit: 'ha' }),
    fact('f_so_own', 'legal_ownership', 'Legal ownership', '100% Soleil Estate SARL', 0.94, 'doc_so_deed'),
  ],
  entities: [
    entity('e_soleil_sarl', 'Soleil Estate SARL', 'ORGANIZATION', 0.93),
    entity('e_soleil_asset', 'Domaine Soleil', 'ASSET', 0.96),
    entity('e_stemilion', 'Saint-Émilion, France', 'LOCATION', 0.91),
  ],
  relationships: [
    rel('r_so_own', 'e_soleil_sarl', 'e_soleil_asset', 'LEGAL_OWNER_OF', 0.94, 'doc_so_deed'),
    rel('r_so_loc', 'e_soleil_asset', 'e_stemilion', 'LOCATED_IN', 0.91, 'doc_so_deed'),
  ],
  timeline: [
    event('t_so_acq', '2022-09-08', 'Estate acquired', 'Meridian purchased Soleil Estate SARL including 42 hectares of AOC vines.', 'OWNERSHIP', 0.93, 'doc_so_deed'),
    event('t_so_val', '2026-05-15', 'Appraisal update', 'Rural assets specialist marked the estate at EUR 18.6m.', 'VALUATION', 0.8, 'doc_so_val'),
  ],
  valuation: soleilValuation,
  risk: soleilRisk,
};

const nimbusValuation: ValuationSummary = {
  amount: 31_400_000,
  currency: 'USD',
  method: 'Aircraft blue-book residual with maintenance-adjusted discount',
  asOf: '2026-04-20T00:00:00.000Z',
  low: 29_800_000,
  high: 33_000_000,
  confidence: 0.83,
  notes: ['Airframe hours are below peer average; engines are on JSSI.'],
};

const nimbusRisk: RiskSummary = {
  overall: 42,
  rating: 'MODERATE',
  confidence: 0.79,
  flags: ['Residual value sensitivity to utilization', 'Operator jurisdiction complexity'],
  dimensions: [
    { key: 'airworthiness', label: 'Airworthiness', score: 24, rationale: 'Current certificate and maintenance records are complete.' },
    { key: 'residual', label: 'Residual value', score: 49, rationale: 'Large-cabin residuals remain cyclical.' },
    { key: 'document_coverage', label: 'Document coverage', score: 27, rationale: 'Bill of sale, insurance and valuation on file.' },
  ],
};

const nimbusDna: AssetDnaEnvelope = {
  assetId: nimbusId,
  version: 1,
  generatedAt: now,
  summary:
    'Nimbus G650ER is a 2018 Gulfstream held through an Isle of Man SPV. Current maintenance-adjusted value is USD 31.4m with clean title and moderate residual-value risk.',
  sourceDocumentIds: ['doc_ni_sale', 'doc_ni_val', 'doc_ni_ins'],
  confidence: { overall: 0.82, coverage: 0.84, provenance: 0.86 },
  facts: [
    fact('f_ni_val', 'market_value', 'Market value', 'USD 31,400,000', 0.84, 'doc_ni_val', { numericValue: 31_400_000, currency: 'USD' }),
    fact('f_ni_sn', 'serial_number', 'Serial number', 'G650-6231', 0.97, 'doc_ni_sale'),
    fact('f_ni_hours', 'airframe_hours', 'Airframe hours', '2,140', 0.88, 'doc_ni_val', { numericValue: 2140, unit: 'hours' }),
  ],
  entities: [
    entity('e_nimbus_spv', 'Nimbus Aviation IOM Ltd', 'ORGANIZATION', 0.92),
    entity('e_nimbus_asset', 'Gulfstream G650ER G650-6231', 'VEHICLE', 0.95),
  ],
  relationships: [
    rel('r_ni_own', 'e_nimbus_spv', 'e_nimbus_asset', 'LEGAL_OWNER_OF', 0.94, 'doc_ni_sale'),
  ],
  timeline: [
    event('t_ni_acq', '2024-01-19', 'Aircraft acquired', 'Nimbus Aviation IOM Ltd completed purchase of G650-6231.', 'OWNERSHIP', 0.95, 'doc_ni_sale'),
    event('t_ni_val', '2026-04-20', 'Desktop appraisal', 'Aviation residual specialist marked the aircraft at USD 31.4m.', 'VALUATION', 0.84, 'doc_ni_val'),
  ],
  valuation: nimbusValuation,
  risk: nimbusRisk,
};

const klineValuation: ValuationSummary = {
  amount: 6_750_000,
  currency: 'USD',
  method: 'Comparable auction results with condition adjustment',
  asOf: '2026-03-12T00:00:00.000Z',
  low: 5_900_000,
  high: 7_400_000,
  confidence: 0.71,
  notes: ['Market for 1960s color-field works remains deep but price dispersion is wide.'],
};

const klineRisk: RiskSummary = {
  overall: 51,
  rating: 'ELEVATED',
  confidence: 0.7,
  flags: ['Authenticity / provenance sensitivity', 'Insurance sub-limit on transit'],
  dimensions: [
    { key: 'provenance', label: 'Provenance', score: 38, rationale: 'Gallery invoices and exhibition history are complete from 1998 onward.' },
    { key: 'condition', label: 'Condition', score: 27, rationale: 'Latest condition report is excellent with no restoration.' },
    { key: 'liquidity', label: 'Liquidity', score: 62, rationale: 'Sale would likely require a 6–9 month consignment window.' },
  ],
};

const klineDna: AssetDnaEnvelope = {
  assetId: klineId,
  version: 1,
  generatedAt: now,
  summary:
    'Kline Collection — Untitled (1967) is a color-field canvas with exhibition provenance from 1998. Current fair value is USD 6.75m with elevated authenticity and liquidity risk relative to core real assets.',
  sourceDocumentIds: ['doc_kl_invoice', 'doc_kl_cond', 'doc_kl_ins'],
  confidence: { overall: 0.73, coverage: 0.76, provenance: 0.8 },
  facts: [
    fact('f_kl_val', 'market_value', 'Fair value', 'USD 6,750,000', 0.72, 'doc_kl_cond', { numericValue: 6_750_000, currency: 'USD' }),
    fact('f_kl_artist', 'artist', 'Artist', 'Mara Kline', 0.9, 'doc_kl_invoice'),
    fact('f_kl_year', 'year', 'Year', '1967', 0.88, 'doc_kl_invoice'),
  ],
  entities: [
    entity('e_kline_artist', 'Mara Kline', 'PERSON', 0.9),
    entity('e_kline_asset', 'Untitled (1967)', 'ASSET', 0.93),
  ],
  relationships: [
    rel('r_kl_created', 'e_kline_artist', 'e_kline_asset', 'CREATED', 0.9, 'doc_kl_invoice'),
  ],
  timeline: [
    event('t_kl_buy', '2019-06-04', 'Acquired from gallery', 'Purchased from Westline Modern for USD 4.15m.', 'OWNERSHIP', 0.9, 'doc_kl_invoice'),
    event('t_kl_cond', '2026-03-12', 'Condition and value update', 'Conservator confirmed excellent condition; fair value USD 6.75m.', 'VALUATION', 0.74, 'doc_kl_cond'),
  ],
  valuation: klineValuation,
  risk: klineRisk,
};

const cedarValuation: ValuationSummary = {
  amount: 64_200_000,
  currency: 'SGD',
  method: 'Discounted cash flow on in-place industrial leases',
  asOf: '2026-05-31T00:00:00.000Z',
  low: 61_000_000,
  high: 67_800_000,
  confidence: 0.85,
  notes: ['WALE of 6.1 years and 98% occupancy support the DCF.'],
};

const cedarRisk: RiskSummary = {
  overall: 29,
  rating: 'LOW',
  confidence: 0.86,
  flags: ['Foreign ownership approval already obtained'],
  dimensions: [
    { key: 'occupancy', label: 'Occupancy durability', score: 22, rationale: '98% leased to logistics and light manufacturing tenants.' },
    { key: 'title', label: 'Title & approvals', score: 19, rationale: 'JTC industrial title and foreign ownership approval are complete.' },
    { key: 'document_coverage', label: 'Document coverage', score: 24, rationale: 'SPA, title, valuation and insurance are current.' },
  ],
};

const cedarDna: AssetDnaEnvelope = {
  assetId: cedarId,
  version: 2,
  generatedAt: now,
  summary:
    'Cedar Ridge Industrial Park is a 98%-occupied Singapore logistics campus. Independent DCF value is SGD 64.2m with low operational risk and complete title documentation.',
  sourceDocumentIds: ['doc_ce_spa', 'doc_ce_title', 'doc_ce_val', 'doc_ce_ins'],
  confidence: { overall: 0.88, coverage: 0.9, provenance: 0.9 },
  facts: [
    fact('f_ce_val', 'market_value', 'Market value', 'SGD 64,200,000', 0.88, 'doc_ce_val', { numericValue: 64_200_000, currency: 'SGD' }),
    fact('f_ce_occ', 'occupancy', 'Occupancy', '98%', 0.9, 'doc_ce_val', { numericValue: 98, unit: '%' }),
    fact('f_ce_wale', 'wale', 'WALE', '6.1 years', 0.86, 'doc_ce_val', { numericValue: 6.1, unit: 'years' }),
    fact('f_ce_own', 'legal_ownership', 'Legal ownership', '100% Cedar Ridge Pte Ltd', 0.96, 'doc_ce_title'),
  ],
  entities: [
    entity('e_cedar_spv', 'Cedar Ridge Pte Ltd', 'ORGANIZATION', 0.95),
    entity('e_cedar_asset', 'Cedar Ridge Industrial Park', 'ASSET', 0.97),
    entity('e_singapore', 'Tuas, Singapore', 'LOCATION', 0.92),
  ],
  relationships: [
    rel('r_ce_own', 'e_cedar_spv', 'e_cedar_asset', 'LEGAL_OWNER_OF', 0.96, 'doc_ce_title'),
    rel('r_ce_loc', 'e_cedar_asset', 'e_singapore', 'LOCATED_IN', 0.92, 'doc_ce_title'),
  ],
  timeline: [
    event('t_ce_acq', '2023-07-21', 'Campus acquired', 'Cedar Ridge Pte Ltd completed purchase of the Tuas industrial campus.', 'OWNERSHIP', 0.95, 'doc_ce_spa'),
    event('t_ce_val', '2026-05-31', 'DCF valuation', 'Independent valuer marked the park at SGD 64.2m.', 'VALUATION', 0.88, 'doc_ce_val'),
  ],
  valuation: cedarValuation,
  risk: cedarRisk,
};

const hvSpaText = `SHARE PURCHASE AGREEMENT
Harbourview Tower SPV Limited
Date: 18 March 2024
Buyer: Meridian Capital Partners LLP
Seller: Northbridge Estates Ltd
Purchase price: GBP 86,400,000
Ownership transferred: 100%
Property: 14 Harbourview, Canary Wharf, London E14 5AB
Governing law: England and Wales`;

const hvTitleText = `HM LAND REGISTRY EXTRACT
Title number: EGL938441
Property: Harbourview Tower, 14 Harbourview, London E14 5AB
Proprietor: Harbourview Tower SPV Limited
Legal ownership: 100% Harbourview Tower SPV Limited
Charges: None recorded
Jurisdiction: England & Wales`;

const hvValText = `INDEPENDENT VALUATION MEMORANDUM
Asset: Harbourview Tower
Valuer: Knightvale Advisory
As of: 30 June 2026
Market value: GBP 92,800,000
Method: Income capitalization
Cap rate: 5.35%
NIA: 312,000 sq ft
Occupancy: 94%
WALT: 7.4 years
Passing rent: GBP 5,120,000`;

const hvInsText = `PROPERTY INSURANCE CERTIFICATE
Insured: Harbourview Tower SPV Limited
Period: 1 September 2025 to 31 August 2026
Declared value: GBP 95,000,000
Coverage: All risks of physical loss or damage`;

const hvKycText = `KYC / OWNERSHIP PACK
Ultimate parent: Meridian Capital Partners LLP
SPV: Harbourview Tower SPV Limited
Beneficial ownership: 100% Meridian Capital Partners LLP
Directors: Elena Voss, Jonathan Hale`;

export function buildSeedData(): CaprovData {
  return {
    organizations: [
      {
        id: orgId,
        name: 'Meridian Capital Partners',
        slug: 'meridian-capital',
        status: 'ACTIVE',
        llmModelId: defaultLlmModelId,
        createdAt: '2021-04-12T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: platformOrgId,
        name: 'Caprov Platform',
        slug: 'caprov-platform',
        status: 'ACTIVE',
        llmModelId: defaultLlmModelId,
        createdAt: '2020-01-06T09:00:00.000Z',
        updatedAt: now,
      },
    ],
    users: [
      {
        id: elenaId,
        email: 'elena@meridian.caprov',
        passwordHash,
        fullName: 'Elena Voss',
        title: 'Managing Partner',
        createdAt: '2021-04-12T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: arjunId,
        email: 'arjun@meridian.caprov',
        passwordHash,
        fullName: 'Arjun Mehta',
        title: 'Senior Analyst',
        createdAt: '2022-01-18T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: sofiaId,
        email: 'sofia@meridian.caprov',
        passwordHash,
        fullName: 'Sofia Laurent',
        title: 'Head of Compliance',
        createdAt: '2022-06-02T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: adminId,
        email: platformAdminEmail,
        passwordHash,
        fullName: platformAdminName,
        title: 'Platform Administrator',
        createdAt: '2020-01-06T09:00:00.000Z',
        updatedAt: now,
      },
    ],
    memberships: [
      { id: 'mem_elena', organizationId: orgId, userId: elenaId, role: 'ORG_ADMIN', createdAt: '2021-04-12T09:00:00.000Z' },
      { id: 'mem_arjun', organizationId: orgId, userId: arjunId, role: 'ANALYST', createdAt: '2022-01-18T09:00:00.000Z' },
      { id: 'mem_sofia', organizationId: orgId, userId: sofiaId, role: 'COMPLIANCE', createdAt: '2022-06-02T09:00:00.000Z' },
      { id: 'mem_caprov_admin', organizationId: platformOrgId, userId: adminId, role: 'PLATFORM_ADMIN', createdAt: '2020-01-06T09:00:00.000Z' },
    ],
    organizationAccessRequests: [],
    assets: [
      {
        id: harbourId,
        organizationId: orgId,
        name: 'Harbourview Tower',
        assetClass: 'REAL_ESTATE',
        status: 'ACTIVE',
        currency: 'GBP',
        jurisdiction: 'England & Wales',
        location: 'Canary Wharf, London',
        description: 'Class A office tower with a diversified tenant roster and 312,000 sq ft NIA.',
        creationDate: '2024-03-18',
        createdAt: '2024-03-18T12:00:00.000Z',
        updatedAt: now,
      },
      {
        id: aureliaId,
        organizationId: orgId,
        name: 'Aurelia Private Credit Fund III',
        assetClass: 'PRIVATE_CREDIT',
        status: 'ACTIVE',
        currency: 'USD',
        jurisdiction: 'Delaware, USA',
        location: 'New York',
        description: 'Senior secured mid-market private credit commitment with quarterly NAV reporting.',
        creationDate: '2023-11-02',
        createdAt: '2023-11-02T12:00:00.000Z',
        updatedAt: now,
      },
      {
        id: soleilId,
        organizationId: orgId,
        name: 'Domaine Soleil',
        assetClass: 'AGRICULTURE',
        status: 'ACTIVE',
        currency: 'EUR',
        jurisdiction: 'France',
        location: 'Saint-Émilion',
        description: '42-hectare AOC vineyard estate operated with a local wine-making partner.',
        creationDate: '2022-09-08',
        createdAt: '2022-09-08T12:00:00.000Z',
        updatedAt: now,
      },
      {
        id: nimbusId,
        organizationId: orgId,
        name: 'Nimbus G650ER',
        assetClass: 'AVIATION',
        status: 'ACTIVE',
        currency: 'USD',
        jurisdiction: 'Isle of Man',
        location: 'Farnborough / IOM',
        description: '2018 Gulfstream G650ER held in an Isle of Man aviation SPV.',
        creationDate: '2024-01-19',
        createdAt: '2024-01-19T12:00:00.000Z',
        updatedAt: now,
      },
      {
        id: klineId,
        organizationId: orgId,
        name: 'Kline Collection — Untitled (1967)',
        assetClass: 'ART',
        status: 'UNDER_REVIEW',
        currency: 'USD',
        jurisdiction: 'New York, USA',
        location: 'Freeport storage, Geneva',
        description: 'Color-field canvas with gallery and exhibition provenance from 1998.',
        creationDate: '2019-06-04',
        createdAt: '2019-06-04T12:00:00.000Z',
        updatedAt: now,
      },
      {
        id: cedarId,
        organizationId: orgId,
        name: 'Cedar Ridge Industrial Park',
        assetClass: 'INFRASTRUCTURE',
        status: 'ACTIVE',
        currency: 'SGD',
        jurisdiction: 'Singapore',
        location: 'Tuas, Singapore',
        description: 'Multi-let industrial and logistics campus with 98% occupancy.',
        creationDate: '2023-07-21',
        createdAt: '2023-07-21T12:00:00.000Z',
        updatedAt: now,
      },
    ],
    ownerships: [
      { id: 'own_hv_1', assetId: harbourId, holderName: 'Harbourview Tower SPV Limited', type: 'LEGAL', percentage: 100, asOf: '2024-03-18' },
      { id: 'own_hv_2', assetId: harbourId, holderName: 'Meridian Capital Partners LLP', type: 'BENEFICIAL', percentage: 100, asOf: '2024-03-18' },
      { id: 'own_au_1', assetId: aureliaId, holderName: 'Meridian Capital Partners LLP', type: 'ECONOMIC', percentage: 100, asOf: '2023-11-02', notes: 'LP commitment interest' },
      { id: 'own_so_1', assetId: soleilId, holderName: 'Soleil Estate SARL', type: 'LEGAL', percentage: 100, asOf: '2022-09-08' },
      { id: 'own_ni_1', assetId: nimbusId, holderName: 'Nimbus Aviation IOM Ltd', type: 'LEGAL', percentage: 100, asOf: '2024-01-19' },
      { id: 'own_kl_1', assetId: klineId, holderName: 'Meridian Art Holdings LLC', type: 'LEGAL', percentage: 100, asOf: '2019-06-04' },
      { id: 'own_ce_1', assetId: cedarId, holderName: 'Cedar Ridge Pte Ltd', type: 'LEGAL', percentage: 100, asOf: '2023-07-21' },
    ],
    documents: withDocumentVersioning([
      { id: 'doc_hv_spa', organizationId: orgId, assetId: harbourId, name: 'Harbourview SPA.pdf', type: 'SPA', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_hv_spa.txt', sizeBytes: hvSpaText.length, extractedText: hvSpaText, createdAt: '2024-03-18T13:00:00.000Z' },
      { id: 'doc_hv_title', organizationId: orgId, assetId: harbourId, name: 'Land Registry Extract.pdf', type: 'TITLE_DEED', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_hv_title.txt', sizeBytes: hvTitleText.length, extractedText: hvTitleText, createdAt: '2024-03-18T13:05:00.000Z' },
      { id: 'doc_hv_val', organizationId: orgId, assetId: harbourId, name: 'Knightvale Valuation Memo.pdf', type: 'VALUATION_MEMO', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_hv_val.txt', sizeBytes: hvValText.length, extractedText: hvValText, createdAt: '2026-07-02T09:00:00.000Z' },
      { id: 'doc_hv_ins', organizationId: orgId, assetId: harbourId, name: 'Property Insurance Certificate.pdf', type: 'INSURANCE', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_hv_ins.txt', sizeBytes: hvInsText.length, extractedText: hvInsText, createdAt: '2025-09-01T09:00:00.000Z' },
      { id: 'doc_hv_kyc', organizationId: orgId, assetId: harbourId, name: 'SPV KYC Pack.pdf', type: 'KYC', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_hv_kyc.txt', sizeBytes: hvKycText.length, extractedText: hvKycText, createdAt: '2024-03-10T09:00:00.000Z' },
      { id: 'doc_au_lpa', organizationId: orgId, assetId: aureliaId, name: 'Aurelia Fund III LPA.pdf', type: 'LPA', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_au_lpa.txt', sizeBytes: 420, extractedText: 'LIMITED PARTNERSHIP AGREEMENT\nAurelia Private Credit Fund III\nCommitment: USD 50,000,000\nLP: Meridian Capital Partners LLP\nGP: Aurelia Credit Partners LP\nFinal close: 2 November 2023', createdAt: '2023-11-02T14:00:00.000Z' },
      { id: 'doc_au_nav', organizationId: orgId, assetId: aureliaId, name: 'Q2 2026 NAV Statement.pdf', type: 'FINANCIAL_STATEMENT', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_au_nav.txt', sizeBytes: 380, extractedText: 'NAV STATEMENT\nAurelia Private Credit Fund III\nAs of: 30 June 2026\nLatest NAV: USD 48,250,000\nCalled capital: 96%\nCurrent yield: 11.4%\nECL overlay: 1.8%', createdAt: '2026-07-12T14:00:00.000Z' },
      { id: 'doc_au_kyc', organizationId: orgId, assetId: aureliaId, name: 'GP KYC Summary.pdf', type: 'KYC', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_au_kyc.txt', sizeBytes: 220, extractedText: 'KYC SUMMARY\nAurelia Credit Partners LP\nDomicile: Delaware\nAML status: Approved\nLast review: 12 January 2026', createdAt: '2026-01-12T14:00:00.000Z' },
      { id: 'doc_so_deed', organizationId: orgId, assetId: soleilId, name: 'Notarial Deed — Domaine Soleil.pdf', type: 'TITLE_DEED', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_so_deed.txt', sizeBytes: 300, extractedText: 'NOTARIAL DEED\nSoleil Estate SARL\nEstate size: 42 hectares\nAppellation: Saint-Émilion AOC\nLegal ownership: 100%\nAcquisition date: 8 September 2022\nPurchase price: EUR 16,900,000', createdAt: '2022-09-08T14:00:00.000Z' },
      { id: 'doc_so_val', organizationId: orgId, assetId: soleilId, name: 'Vineyard Appraisal 2026.pdf', type: 'VALUATION_MEMO', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_so_val.txt', sizeBytes: 240, extractedText: 'APPRAISAL\nDomaine Soleil\nMarket value: EUR 18,600,000\nAs of: 15 May 2026\nMethod: Comparable vineyard transactions', createdAt: '2026-05-20T14:00:00.000Z' },
      { id: 'doc_so_ins', organizationId: orgId, assetId: soleilId, name: 'Crop & Property Insurance.pdf', type: 'INSURANCE', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_so_ins.txt', sizeBytes: 180, extractedText: 'INSURANCE CERTIFICATE\nInsured: Soleil Estate SARL\nDeclared value: EUR 19,000,000\nPeriod: 2026', createdAt: '2026-01-05T14:00:00.000Z' },
      { id: 'doc_ni_sale', organizationId: orgId, assetId: nimbusId, name: 'Aircraft Bill of Sale.pdf', type: 'SPA', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ni_sale.txt', sizeBytes: 260, extractedText: 'AIRCRAFT BILL OF SALE\nNimbus Aviation IOM Ltd\nSerial number: G650-6231\nType: Gulfstream G650ER\nPurchase price: USD 34,200,000\nDate: 19 January 2024', createdAt: '2024-01-19T14:00:00.000Z' },
      { id: 'doc_ni_val', organizationId: orgId, assetId: nimbusId, name: 'Aviation Residual Appraisal.pdf', type: 'VALUATION_MEMO', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ni_val.txt', sizeBytes: 240, extractedText: 'AVIATION APPRAISAL\nMarket value: USD 31,400,000\nAirframe hours: 2,140\nEngines: JSSI enrolled\nAs of: 20 April 2026', createdAt: '2026-04-22T14:00:00.000Z' },
      { id: 'doc_ni_ins', organizationId: orgId, assetId: nimbusId, name: 'Hull Insurance.pdf', type: 'INSURANCE', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ni_ins.txt', sizeBytes: 160, extractedText: 'HULL INSURANCE\nInsured value: USD 33,000,000\nOperator: Nimbus Aviation IOM Ltd', createdAt: '2026-01-19T14:00:00.000Z' },
      { id: 'doc_kl_invoice', organizationId: orgId, assetId: klineId, name: 'Westline Gallery Invoice.pdf', type: 'SPA', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_kl_invoice.txt', sizeBytes: 220, extractedText: 'GALLERY INVOICE\nArtist: Mara Kline\nWork: Untitled (1967)\nPurchase price: USD 4,150,000\nBuyer: Meridian Art Holdings LLC\nDate: 4 June 2019', createdAt: '2019-06-04T14:00:00.000Z' },
      { id: 'doc_kl_cond', organizationId: orgId, assetId: klineId, name: 'Condition & Fair Value Report.pdf', type: 'VALUATION_MEMO', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_kl_cond.txt', sizeBytes: 200, extractedText: 'CONDITION REPORT\nFair value: USD 6,750,000\nCondition: Excellent\nAs of: 12 March 2026', createdAt: '2026-03-12T14:00:00.000Z' },
      { id: 'doc_kl_ins', organizationId: orgId, assetId: klineId, name: 'Fine Art Insurance.pdf', type: 'INSURANCE', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_kl_ins.txt', sizeBytes: 150, extractedText: 'FINE ART INSURANCE\nInsured value: USD 7,000,000\nLocation: Geneva freeport', createdAt: '2026-03-12T15:00:00.000Z' },
      { id: 'doc_ce_spa', organizationId: orgId, assetId: cedarId, name: 'Cedar Ridge SPA.pdf', type: 'SPA', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ce_spa.txt', sizeBytes: 240, extractedText: 'SALE AND PURCHASE AGREEMENT\nCedar Ridge Pte Ltd\nPurchase price: SGD 58,750,000\nDate: 21 July 2023\nLocation: Tuas, Singapore', createdAt: '2023-07-21T14:00:00.000Z' },
      { id: 'doc_ce_title', organizationId: orgId, assetId: cedarId, name: 'JTC Title Extract.pdf', type: 'TITLE_DEED', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ce_title.txt', sizeBytes: 200, extractedText: 'JTC TITLE EXTRACT\nLegal ownership: 100% Cedar Ridge Pte Ltd\nProperty: Cedar Ridge Industrial Park, Tuas\nForeign ownership approval: Granted', createdAt: '2023-07-21T14:10:00.000Z' },
      { id: 'doc_ce_val', organizationId: orgId, assetId: cedarId, name: 'Industrial DCF Valuation.pdf', type: 'VALUATION_MEMO', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ce_val.txt', sizeBytes: 220, extractedText: 'VALUATION\nMarket value: SGD 64,200,000\nOccupancy: 98%\nWALE: 6.1 years\nMethod: Discounted cash flow\nAs of: 31 May 2026', createdAt: '2026-06-04T14:00:00.000Z' },
      { id: 'doc_ce_ins', organizationId: orgId, assetId: cedarId, name: 'Industrial All-Risks Policy.pdf', type: 'INSURANCE', status: 'READY', mimeType: 'text/plain', storageKey: 'seed/doc_ce_ins.txt', sizeBytes: 150, extractedText: 'INSURANCE\nDeclared value: SGD 68,000,000\nInsured: Cedar Ridge Pte Ltd', createdAt: '2026-01-15T14:00:00.000Z' },
    ]),
    portfolios: [
      { id: 'ptf_core', organizationId: orgId, name: 'Core Real Assets', description: 'Stabilized real estate and industrial infrastructure.', baseCurrency: 'GBP', createdAt: '2024-04-01T09:00:00.000Z', updatedAt: now },
      { id: 'ptf_alts', organizationId: orgId, name: 'Alternatives & Credit', description: 'Private credit and operating alternatives.', baseCurrency: 'USD', createdAt: '2024-04-01T09:00:00.000Z', updatedAt: now },
      { id: 'ptf_collect', organizationId: orgId, name: 'Specialty Assets', description: 'Aviation, art and agricultural holdings.', baseCurrency: 'USD', createdAt: '2024-04-01T09:00:00.000Z', updatedAt: now },
    ],
    holdings: [
      { id: 'hld_1', portfolioId: 'ptf_core', assetId: harbourId, weight: 58 },
      { id: 'hld_2', portfolioId: 'ptf_core', assetId: cedarId, weight: 42 },
      { id: 'hld_3', portfolioId: 'ptf_alts', assetId: aureliaId, weight: 100 },
      { id: 'hld_4', portfolioId: 'ptf_collect', assetId: soleilId, weight: 33 },
      { id: 'hld_5', portfolioId: 'ptf_collect', assetId: nimbusId, weight: 47 },
      { id: 'hld_6', portfolioId: 'ptf_collect', assetId: klineId, weight: 20 },
    ],
    auditEvents: [
      { id: 'aud_1', organizationId: orgId, actorUserId: elenaId, action: 'organization.seeded', entityType: 'Organization', entityId: orgId, createdAt: '2021-04-12T09:00:00.000Z', metadata: { source: 'demo-seed' } },
      { id: 'aud_2', organizationId: orgId, actorUserId: arjunId, action: 'intelligence.pipeline_completed', entityType: 'Asset', entityId: harbourId, createdAt: '2026-07-02T10:15:00.000Z', metadata: { version: 3 } },
      { id: 'aud_3', organizationId: orgId, actorUserId: sofiaId, action: 'document.reviewed', entityType: 'Document', entityId: 'doc_hv_kyc', createdAt: '2026-07-08T16:40:00.000Z' },
      { id: 'aud_4', organizationId: orgId, actorUserId: arjunId, action: 'valuation.snapshot_created', entityType: 'Asset', entityId: cedarId, createdAt: '2026-06-04T15:20:00.000Z' },
      { id: 'aud_5', organizationId: orgId, actorUserId: elenaId, action: 'portfolio.updated', entityType: 'Portfolio', entityId: 'ptf_core', createdAt: '2026-06-18T11:05:00.000Z' },
    ],
    jobs: [
      { id: 'job_hv_full', organizationId: orgId, assetId: harbourId, type: 'FULL_PIPELINE', status: 'COMPLETED', createdAt: '2026-07-02T10:00:00.000Z', completedAt: '2026-07-02T10:15:00.000Z', result: { dnaVersion: 3 } },
      { id: 'job_au_full', organizationId: orgId, assetId: aureliaId, type: 'FULL_PIPELINE', status: 'COMPLETED', createdAt: '2026-07-12T14:10:00.000Z', completedAt: '2026-07-12T14:18:00.000Z', result: { dnaVersion: 2 } },
      { id: 'job_ce_val', organizationId: orgId, assetId: cedarId, type: 'VALUATION', status: 'COMPLETED', createdAt: '2026-06-04T14:30:00.000Z', completedAt: '2026-06-04T14:36:00.000Z' },
    ],
    dnaSnapshots: [
      { id: 'dna_hv_3', assetId: harbourId, version: 3, envelope: harbourDna, contentHash: 'seed-hv-3', hashAlgorithm: 'sha256', createdAt: now },
      { id: 'dna_au_2', assetId: aureliaId, version: 2, envelope: aureliaDna, contentHash: 'seed-au-2', hashAlgorithm: 'sha256', createdAt: now },
      { id: 'dna_so_2', assetId: soleilId, version: 2, envelope: soleilDna, contentHash: 'seed-so-2', hashAlgorithm: 'sha256', createdAt: now },
      { id: 'dna_ni_1', assetId: nimbusId, version: 1, envelope: nimbusDna, contentHash: 'seed-ni-1', hashAlgorithm: 'sha256', createdAt: now },
      { id: 'dna_kl_1', assetId: klineId, version: 1, envelope: klineDna, contentHash: 'seed-kl-1', hashAlgorithm: 'sha256', createdAt: now },
      { id: 'dna_ce_2', assetId: cedarId, version: 2, envelope: cedarDna, contentHash: 'seed-ce-2', hashAlgorithm: 'sha256', createdAt: now },
    ],
    valuations: [
      { id: 'val_hv', assetId: harbourId, payload: harbourValuation, createdAt: '2026-06-30T00:00:00.000Z' },
      { id: 'val_au', assetId: aureliaId, payload: aureliaValuation, createdAt: '2026-06-30T00:00:00.000Z' },
      { id: 'val_so', assetId: soleilId, payload: soleilValuation, createdAt: '2026-05-15T00:00:00.000Z' },
      { id: 'val_ni', assetId: nimbusId, payload: nimbusValuation, createdAt: '2026-04-20T00:00:00.000Z' },
      { id: 'val_kl', assetId: klineId, payload: klineValuation, createdAt: '2026-03-12T00:00:00.000Z' },
      { id: 'val_ce', assetId: cedarId, payload: cedarValuation, createdAt: '2026-05-31T00:00:00.000Z' },
    ],
    projections: [],
    risks: [
      { id: 'rsk_hv', assetId: harbourId, payload: harbourRisk, createdAt: now },
      { id: 'rsk_au', assetId: aureliaId, payload: aureliaRisk, createdAt: now },
      { id: 'rsk_so', assetId: soleilId, payload: soleilRisk, createdAt: now },
      { id: 'rsk_ni', assetId: nimbusId, payload: nimbusRisk, createdAt: now },
      { id: 'rsk_kl', assetId: klineId, payload: klineRisk, createdAt: now },
      { id: 'rsk_ce', assetId: cedarId, payload: cedarRisk, createdAt: now },
    ],
    provenanceAnchors: [],
    facts: [
      { id: 'pf_1', documentId: 'doc_hv_spa', key: 'purchase_price', value: 'GBP 86,400,000', confidence: 0.96, fragment: 'Purchase price: GBP 86,400,000', observedAt: now },
      { id: 'pf_2', documentId: 'doc_hv_val', key: 'market_value', value: 'GBP 92,800,000', confidence: 0.9, fragment: 'Market value: GBP 92,800,000', observedAt: now },
      { id: 'pf_3', documentId: 'doc_au_nav', key: 'nav', value: 'USD 48,250,000', confidence: 0.9, fragment: 'Latest NAV: USD 48,250,000', observedAt: now },
    ],
    copilotThreads: [
      {
        id: 'thd_welcome',
        organizationId: orgId,
        userId: arjunId,
        assetId: harbourId,
        title: 'Harbourview lease-roll risk',
        createdAt: '2026-07-15T09:30:00.000Z',
        updatedAt: '2026-07-15T09:31:00.000Z',
      },
    ],
    copilotMessages: [
      {
        id: 'msg_1',
        threadId: 'thd_welcome',
        role: 'user',
        content: 'What is the current value and the main risk on Harbourview Tower?',
        createdAt: '2026-07-15T09:30:00.000Z',
      },
      {
        id: 'msg_2',
        threadId: 'thd_welcome',
        role: 'assistant',
        content:
          'Harbourview Tower is marked at GBP 92.8m as of 30 June 2026, up from the GBP 86.4m acquisition price. Overall risk is moderate (34). The dominant issues are single-asset concentration in Canary Wharf and a lease-expiry cluster in 2029, despite 94% occupancy and a 7.4-year WALT. Title is clean and 100% owned through Harbourview Tower SPV Limited.',
        citations: [
          { label: 'Knightvale Valuation Memo', documentId: 'doc_hv_val' },
          { label: 'Land Registry Extract', documentId: 'doc_hv_title' },
        ],
        createdAt: '2026-07-15T09:31:00.000Z',
      },
    ],
    listings: [
      {
        id: 'lst_harbour_core',
        organizationId: orgId,
        assetId: harbourId,
        title: 'Harbourview Tower — 25% economic interest',
        offeringType: 'SALE',
        status: 'PARTIALLY_FILLED',
        askPrice: 92_800_000,
        currency: 'GBP',
        quantityBps: 2500,
        remainingBps: 1500,
        createdAt: '2026-07-20T10:00:00.000Z',
        updatedAt: '2026-07-22T11:00:00.000Z',
      },
      {
        id: 'lst_cedar_open',
        organizationId: orgId,
        assetId: cedarId,
        title: 'Cedar Ridge Industrial — full interest',
        offeringType: 'SALE',
        status: 'OPEN',
        askPrice: 64_200_000,
        currency: 'SGD',
        quantityBps: 10_000,
        remainingBps: 10_000,
        createdAt: '2026-07-28T09:00:00.000Z',
        updatedAt: '2026-07-28T09:00:00.000Z',
      },
    ],
    orders: [
      {
        id: 'ord_hv_buy_1',
        organizationId: orgId,
        listingId: 'lst_harbour_core',
        assetId: harbourId,
        side: 'BUY',
        status: 'FILLED',
        price: 92_800_000,
        currency: 'GBP',
        quantityBps: 1000,
        filledBps: 1000,
        createdByUserId: arjunId,
        createdAt: '2026-07-22T10:55:00.000Z',
        updatedAt: '2026-07-22T11:00:00.000Z',
      },
    ],
    trades: [
      {
        id: 'trd_hv_1',
        organizationId: orgId,
        listingId: 'lst_harbour_core',
        orderId: 'ord_hv_buy_1',
        assetId: harbourId,
        status: 'SETTLED',
        price: 92_800_000,
        currency: 'GBP',
        quantityBps: 1000,
        notional: 9_280_000,
        createdAt: '2026-07-22T11:00:00.000Z',
        updatedAt: '2026-07-22T16:00:00.000Z',
      },
    ],
    settlements: [
      {
        id: 'stl_hv_1',
        organizationId: orgId,
        tradeId: 'trd_hv_1',
        assetId: harbourId,
        status: 'COMPLETED',
        method: 'OFF_CHAIN',
        notes: 'Demo settlement against Meridian custody account.',
        completedAt: '2026-07-22T16:00:00.000Z',
        createdAt: '2026-07-22T12:00:00.000Z',
        updatedAt: '2026-07-22T16:00:00.000Z',
      },
    ],
    tokens: [
      {
        id: 'tok_cedar_1',
        organizationId: orgId,
        assetId: cedarId,
        status: 'SIMULATED',
        chainId: 11155111,
        chainName: 'Ethereum Sepolia',
        contractAddress: undefined,
        tokenId: 'tok_cedar_1',
        supply: 1_000_000,
        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        txHash: '0xdemoCedarTokenizationSepolia00000000000000000000000000000001',
        explorerUrl:
          'https://sepolia.etherscan.io/tx/0xdemoCedarTokenizationSepolia00000000000000000000000000000001',
        mode: 'SIMULATED',
        createdAt: '2026-07-25T10:00:00.000Z',
        updatedAt: '2026-07-25T10:00:00.000Z',
      },
    ],
    collateralPositions: [
      {
        id: 'col_cedar_1',
        organizationId: orgId,
        assetId: cedarId,
        tokenId: 'tok_cedar_1',
        status: 'ACTIVE',
        pledgedValue: 64_200_000,
        currency: 'SGD',
        haircutBps: 1500,
        advanceableValue: 54_570_000,
        createdAt: '2026-07-26T09:00:00.000Z',
        updatedAt: '2026-07-26T09:00:00.000Z',
      },
    ],
    loans: [
      {
        id: 'loan_cedar_1',
        organizationId: orgId,
        collateralId: 'col_cedar_1',
        assetId: cedarId,
        status: 'ACTIVE',
        principal: 25_000_000,
        currency: 'SGD',
        interestRateBps: 650,
        termDays: 365,
        outstanding: 25_000_000,
        ltvBps: 3894,
        createdAt: '2026-07-26T10:00:00.000Z',
        updatedAt: '2026-07-26T10:00:00.000Z',
      },
    ],
  };
}

export const DEMO_ACCOUNTS = [
  { email: platformAdminEmail, password: DEMO_PASSWORD, name: platformAdminName, role: 'PLATFORM_ADMIN' },
  { email: 'elena@meridian.caprov', password: DEMO_PASSWORD, name: 'Elena Voss', role: 'ORG_ADMIN' },
  { email: 'arjun@meridian.caprov', password: DEMO_PASSWORD, name: 'Arjun Mehta', role: 'ANALYST' },
  { email: 'sofia@meridian.caprov', password: DEMO_PASSWORD, name: 'Sofia Laurent', role: 'COMPLIANCE' },
];
