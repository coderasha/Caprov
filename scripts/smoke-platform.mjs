#!/usr/bin/env node
/**
 * End-to-end smoke test for CAPROV platform features.
 * Usage: node scripts/smoke-platform.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3000';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:8000/api';

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
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
  return { status: response.status, ok: response.ok, data };
}

async function main() {
  // Health
  for (const [name, url] of [
    ['Web homepage', `${WEB}/`],
    ['API health', `${API}/health`],
    ['Engine health', `${ENGINE}/health`],
  ]) {
    try {
      const response = await fetch(url);
      if (response.ok) pass(name, String(response.status));
      else fail(name, `HTTP ${response.status}`);
    } catch (error) {
      fail(name, error instanceof Error ? error.message : 'unreachable');
    }
  }

  // Auth
  const login = await request(API, '/auth/login', {
    method: 'POST',
    body: { email: 'arjun@meridian.caprov', password: 'CaprovDemo!23' },
  });
  if (!login.ok || !login.data?.token) {
    fail('Auth login', JSON.stringify(login.data));
    summarize();
    process.exit(1);
  }
  pass('Auth login', login.data.user.email);
  const token = login.data.token;

  const me = await request(API, '/auth/me', { token });
  me.ok ? pass('Auth session', me.data?.email || me.data?.user?.email || 'ok') : fail('Auth session', JSON.stringify(me.data));

  // Org / RBAC / users
  const org = await request(API, '/organizations/current', { token });
  org.ok ? pass('Organization current', org.data?.name) : fail('Organization current', JSON.stringify(org.data));

  const roles = await request(API, '/rbac/roles', { token });
  roles.ok && Array.isArray(roles.data) && roles.data.length
    ? pass('RBAC roles', `${roles.data.length} roles`)
    : fail('RBAC roles', JSON.stringify(roles.data));

  const users = await request(API, '/users', { token });
  users.ok && Array.isArray(users.data)
    ? pass('Users list', `${users.data.length} members`)
    : fail('Users list', JSON.stringify(users.data));

  // Assets
  const assets = await request(API, '/assets', { token });
  if (!assets.ok || !Array.isArray(assets.data) || !assets.data.length) {
    fail('Assets list', JSON.stringify(assets.data));
  } else {
    pass('Assets list', `${assets.data.length} assets`);
  }
  const assetId = assets.data?.[0]?.id || 'ast_harbourview';
  const asset = await request(API, `/assets/${assetId}`, { token });
  asset.ok ? pass('Asset detail', asset.data?.name) : fail('Asset detail', JSON.stringify(asset.data));

  // Documents
  const docs = await request(API, '/documents', { token });
  docs.ok && Array.isArray(docs.data)
    ? pass('Documents list', `${docs.data.length} docs`)
    : fail('Documents list', JSON.stringify(docs.data));

  const ingested = await request(API, '/documents', {
    method: 'POST',
    token,
    body: {
      name: `Smoke Valuation ${Date.now()}.pdf`,
      type: 'VALUATION_MEMO',
      assetId,
      extractedText: `INDEPENDENT VALUATION\nMarket value: GBP 99,500,000\nAs of: 1 August 2026\nOccupancy: 95%\nWALT: 6.8 years`,
    },
  });
  ingested.ok
    ? pass('Document ingest', ingested.data?.id)
    : fail('Document ingest', JSON.stringify(ingested.data));

  // Intelligence models
  const models = await request(API, '/intelligence/models', { token });
  models.ok && models.data?.selectedModelId
    ? pass('LLM models', models.data.selected.label)
    : fail('LLM models', JSON.stringify(models.data));

  const selectModel = await request(API, '/intelligence/models', {
    method: 'PATCH',
    token,
    body: { modelId: 'caprov-deterministic' },
  });
  selectModel.ok && selectModel.data?.selectedModelId === 'caprov-deterministic'
    ? pass('LLM model select', selectModel.data.selectedModelId)
    : fail('LLM model select', JSON.stringify(selectModel.data));

  // Pipeline
  const pipeline = await request(API, `/intelligence/assets/${assetId}/run`, {
    method: 'POST',
    token,
    body: { type: 'FULL_PIPELINE' },
  });
  pipeline.ok && pipeline.data?.status === 'COMPLETED'
    ? pass('Intelligence pipeline', `job ${pipeline.data.id}`)
    : fail('Intelligence pipeline', JSON.stringify(pipeline.data));

  const dna = await request(API, `/intelligence/assets/${assetId}/dna`, { token });
  dna.ok && Array.isArray(dna.data) && dna.data[0]?.envelope
    ? pass('DNA snapshots', `v${dna.data[0].version}`)
    : fail('DNA snapshots', JSON.stringify(dna.data));

  const valuation = await request(API, `/intelligence/assets/${assetId}/valuation`, { token });
  valuation.ok && valuation.data?.[0]?.payload?.amount
    ? pass('Valuation snapshot', `${valuation.data[0].payload.currency} ${valuation.data[0].payload.amount}`)
    : fail('Valuation snapshot', JSON.stringify(valuation.data));

  const projection = await request(API, `/intelligence/assets/${assetId}/projection`, { token });
  projection.ok && projection.data?.[0]?.payload?.horizons?.length
    ? pass('Forward projection', `${projection.data[0].payload.horizons.length} horizons`)
    : fail('Forward projection', JSON.stringify(projection.data));

  const risk = await request(API, `/intelligence/assets/${assetId}/risk`, { token });
  risk.ok && risk.data?.[0]?.payload?.rating
    ? pass('Risk snapshot', risk.data[0].payload.rating)
    : fail('Risk snapshot', JSON.stringify(risk.data));

  // Copilot structured briefing
  const copilot = await request(API, '/intelligence/copilot', {
    method: 'POST',
    token,
    body: {
      assetId,
      message: 'What is the current value and main risk?',
    },
  });
  if (
    copilot.ok &&
    copilot.data?.briefing?.title &&
    Array.isArray(copilot.data?.briefing?.sections) &&
    copilot.data.briefing.sections.length > 0
  ) {
    pass('Copilot briefing', `${copilot.data.briefing.title} · ${copilot.data.briefing.sections.length} sections`);
  } else {
    fail('Copilot briefing', JSON.stringify(copilot.data));
  }

  // Portfolios
  const portfolios = await request(API, '/portfolios', { token });
  portfolios.ok && Array.isArray(portfolios.data)
    ? pass('Portfolios list', `${portfolios.data.length} portfolios`)
    : fail('Portfolios list', JSON.stringify(portfolios.data));

  if (portfolios.data?.[0]?.id) {
    const portfolio = await request(API, `/portfolios/${portfolios.data[0].id}`, { token });
    portfolio.ok
      ? pass('Portfolio detail', portfolio.data?.name)
      : fail('Portfolio detail', JSON.stringify(portfolio.data));
  }

  // Capital markets
  const marketplace = await request(API, '/marketplace', { token });
  marketplace.ok && Array.isArray(marketplace.data?.listings)
    ? pass('Marketplace listings', `${marketplace.data.listings.length} listings`)
    : fail('Marketplace listings', JSON.stringify(marketplace.data));

  const trading = await request(API, '/trading', { token });
  trading.ok
    ? pass('Trading book', `${trading.data?.orders?.length ?? 0} orders / ${trading.data?.trades?.length ?? 0} trades`)
    : fail('Trading book', JSON.stringify(trading.data));

  const settlement = await request(API, '/settlement', { token });
  settlement.ok && Array.isArray(settlement.data)
    ? pass('Settlement list', `${settlement.data.length} settlements`)
    : fail('Settlement list', JSON.stringify(settlement.data));

  const tokenization = await request(API, '/tokenization', { token });
  tokenization.ok && tokenization.data?.network?.chainId === 11155111
    ? pass('Tokenization Sepolia', `${tokenization.data.tokens?.length ?? 0} tokens · ${tokenization.data.network.mode}`)
    : fail('Tokenization Sepolia', JSON.stringify(tokenization.data));

  const collateral = await request(API, '/collateral', { token });
  collateral.ok && Array.isArray(collateral.data)
    ? pass('Collateral positions', `${collateral.data.length} positions`)
    : fail('Collateral positions', JSON.stringify(collateral.data));

  const lending = await request(API, '/lending', { token });
  lending.ok && Array.isArray(lending.data)
    ? pass('Lending facilities', `${lending.data.length} loans`)
    : fail('Lending facilities', JSON.stringify(lending.data));

  // Audit
  const audit = await request(API, '/audit?limit=20', { token });
  audit.ok && Array.isArray(audit.data)
    ? pass('Audit trail', `${audit.data.length} events`)
    : fail('Audit trail', JSON.stringify(audit.data));

  // Jobs
  const jobs = await request(API, '/intelligence/jobs', { token });
  jobs.ok && Array.isArray(jobs.data)
    ? pass('Intelligence jobs', `${jobs.data.length} jobs`)
    : fail('Intelligence jobs', JSON.stringify(jobs.data));

  // Web authenticated routes (HTML)
  for (const path of [
    '/login',
    '/dashboard',
    '/assets',
    '/documents',
    '/intelligence',
    '/intelligence/copilot',
    '/portfolios',
    '/marketplace',
    '/trading',
    '/settlement',
    '/tokenization',
    '/collateral',
    '/lending',
    '/organization',
    '/audit',
  ]) {
    try {
      const response = await fetch(`${WEB}${path}`);
      response.ok || response.status === 307 || response.status === 308
        ? pass(`Web ${path}`, String(response.status))
        : fail(`Web ${path}`, `HTTP ${response.status}`);
    } catch (error) {
      fail(`Web ${path}`, error instanceof Error ? error.message : 'unreachable');
    }
  }

  summarize();
}

function summarize() {
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error('Failed:');
    for (const item of failed) console.error(` - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log('All platform feature smoke checks passed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
