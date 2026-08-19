import type {
  AssetClass,
  AssetDnaEnvelope,
  CurrencyCode,
  DnaFact,
  RiskSummary,
  ValuationProjection,
  ValuationProjectionHorizon,
  ValuationSummary,
} from '@caprov/types';

const CLASS_BASE_GROWTH: Record<AssetClass, number> = {
  REAL_ESTATE: 0.025,
  INFRASTRUCTURE: 0.03,
  PRIVATE_CREDIT: 0.04,
  PRIVATE_EQUITY: 0.05,
  FUND: 0.035,
  AGRICULTURE: 0.015,
  ART: 0.02,
  AVIATION: -0.035,
  OTHER: 0.02,
};

const HORIZONS_YEARS = [1, 3, 5] as const;

function factNumber(facts: DnaFact[], key: string): number | undefined {
  const fact = facts.find((item) => item.key === key);
  return fact?.numericValue;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number): number {
  return Math.round(value);
}

/**
 * Forward valuation model grounded in the current DNA mark and operating facts.
 * Transparent and deterministic — not a market guarantee.
 */
export function projectValuation(input: {
  assetId: string;
  assetClass: AssetClass;
  currency: CurrencyCode;
  valuation?: ValuationSummary;
  risk?: RiskSummary;
  facts: DnaFact[];
}): ValuationProjection | undefined {
  const { valuation, risk, facts, assetClass, currency, assetId } = input;
  if (!valuation?.amount || valuation.amount <= 0) {
    return undefined;
  }

  const baseAmount = valuation.amount;
  const occupancy = factNumber(facts, 'occupancy');
  const walt = factNumber(facts, 'walt') ?? factNumber(facts, 'wale');
  const capRate = factNumber(facts, 'cap_rate');
  const purchase = factNumber(facts, 'purchase_price');

  let growth = CLASS_BASE_GROWTH[assetClass] ?? CLASS_BASE_GROWTH.OTHER;
  const drivers: string[] = [
    `${assetClass.replaceAll('_', ' ').toLowerCase()} base growth ${(growth * 100).toFixed(1)}%`,
  ];

  if (occupancy != null) {
    const adj = clamp((occupancy - 90) * 0.0008, -0.015, 0.015);
    growth += adj;
    drivers.push(`occupancy ${occupancy}% → ${(adj * 100).toFixed(2)} pp`);
  }

  if (walt != null) {
    const adj = clamp((walt - 5) * 0.0015, -0.01, 0.02);
    growth += adj;
    drivers.push(`lease term ${walt}y → ${(adj * 100).toFixed(2)} pp`);
  }

  if (capRate != null) {
    // Lower cap rates (tighter yields) slightly lift expected capital growth in the base case.
    const adj = clamp((6 - capRate) * 0.002, -0.015, 0.015);
    growth += adj;
    drivers.push(`cap rate ${capRate}% → ${(adj * 100).toFixed(2)} pp`);
  }

  if (purchase != null && purchase > 0) {
    const holdYears = Math.max(
      0.5,
      (Date.now() - Date.parse(valuation.asOf || new Date().toISOString())) / (365.25 * 24 * 3600 * 1000) || 1,
    );
    const realized = Math.pow(baseAmount / purchase, 1 / Math.max(holdYears, 0.75)) - 1;
    const adj = clamp(realized * 0.15, -0.01, 0.015);
    growth += adj;
    drivers.push(`realized mark drift vs purchase → ${(adj * 100).toFixed(2)} pp`);
  }

  if (risk) {
    const penalty =
      risk.rating === 'HIGH' ? 0.02 : risk.rating === 'ELEVATED' ? 0.012 : risk.rating === 'MODERATE' ? 0.005 : 0;
    growth -= penalty;
    if (penalty) {
      drivers.push(`risk ${risk.rating.toLowerCase()} −${(penalty * 100).toFixed(1)} pp`);
    }
  }

  growth = clamp(growth, -0.08, 0.1);
  const annualGrowthRate = Number(growth.toFixed(4));

  const baseConfidence = clamp(
    (valuation.confidence ?? 0.8) * 0.85 * (risk?.rating === 'HIGH' ? 0.85 : 1),
    0.35,
    0.9,
  );

  const asOf = new Date(valuation.asOf || Date.now());
  const horizons: ValuationProjectionHorizon[] = HORIZONS_YEARS.map((years) => {
    const target = new Date(asOf);
    target.setFullYear(target.getFullYear() + years);

    const bearGrowth = annualGrowthRate - 0.02;
    const bullGrowth = annualGrowthRate + 0.02;
    const base = roundMoney(baseAmount * Math.pow(1 + annualGrowthRate, years));
    const bear = roundMoney(baseAmount * Math.pow(1 + bearGrowth, years));
    const bull = roundMoney(baseAmount * Math.pow(1 + bullGrowth, years));
    const band = 0.06 + years * 0.025;
    const confidence = Number(clamp(baseConfidence - years * 0.08, 0.25, 0.85).toFixed(2));

    return {
      years,
      asOf: target.toISOString().slice(0, 10),
      base,
      bear,
      bull,
      low: roundMoney(base * (1 - band)),
      high: roundMoney(base * (1 + band)),
      annualGrowthRate,
      confidence,
    };
  });

  return {
    assetId,
    currency,
    baseAmount,
    baseAsOf: valuation.asOf,
    baseMethod: valuation.method,
    model: 'caprov-forward-mark-v1',
    generatedAt: new Date().toISOString(),
    assumptions: {
      annualGrowthRate,
      drivers,
      disclaimer:
        'Model-based forward marks from the current DNA valuation and operating facts. Not a market quote, appraisal, or guarantee of future value.',
    },
    horizons,
    confidence: horizons[0]?.confidence ?? baseConfidence,
    sourceDocumentIds: valuation
      ? facts
          .filter((fact) => ['market_value', 'nav', 'purchase_price'].includes(fact.key))
          .flatMap((fact) => fact.provenance.map((item) => item.sourceDocumentId))
          .filter((id, index, all) => all.indexOf(id) === index)
      : [],
  };
}

export function attachProjection(
  envelope: AssetDnaEnvelope,
  assetClass: AssetClass,
): AssetDnaEnvelope {
  const projection = projectValuation({
    assetId: envelope.assetId,
    assetClass,
    currency: envelope.valuation?.currency ?? 'USD',
    valuation: envelope.valuation,
    risk: envelope.risk,
    facts: envelope.facts,
  });
  if (!projection) {
    return envelope;
  }
  const y3 = projection.horizons.find((item) => item.years === 3);
  return {
    ...envelope,
    projection,
    summary: y3
      ? `${envelope.summary} Forward mark (3y base): ${projection.currency} ${y3.base.toLocaleString('en-GB')} at ${(projection.assumptions.annualGrowthRate * 100).toFixed(1)}% p.a. model growth.`
      : envelope.summary,
  };
}
