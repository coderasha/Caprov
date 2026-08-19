#!/usr/bin/env node
/**
 * Thorough capital-markets + intelligence workflow test.
 * Usage: node scripts/test-capital-markets-e2e.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';

const results = [];
function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

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
  return { status: response.status, ok: response.ok, data };
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'arjun@meridian.caprov', password: 'CaprovDemo!23' },
  });
  if (!login.ok || !login.data?.token) {
    fail('login', JSON.stringify(login.data));
    process.exit(1);
  }
  pass('login', login.data.user.email);
  const token = login.data.token;

  const assets = await request('/assets', { token });
  const asset =
    (assets.data ?? []).find((item) => item.name?.includes('Riverside')) ||
    (assets.data ?? []).find((item) => !['ast_cedar', 'ast_harbourview'].includes(item.id)) ||
    assets.data?.[0];
  if (!asset) {
    fail('pick asset', 'no assets');
    process.exit(1);
  }
  pass('pick asset', `${asset.name} (${asset.id})`);

  // Ensure DNA/valuation exists
  const run = await request(`/intelligence/assets/${asset.id}/run`, {
    method: 'POST',
    token,
    body: { type: 'FULL_PIPELINE' },
  });
  run.ok ? pass('intelligence pipeline', run.data?.job?.id || run.data?.id || 'ok') : fail('intelligence pipeline', JSON.stringify(run.data));

  const valuation = await request(`/intelligence/assets/${asset.id}/valuation`, { token });
  const mark = valuation.data?.[0]?.payload || valuation.data?.payload || valuation.data;
  const amount = mark?.amount ?? asset.latestValuation?.payload?.amount;
  const currency = mark?.currency ?? asset.currency;
  amount
    ? pass('valuation mark', `${currency} ${amount}`)
    : fail('valuation mark', JSON.stringify(valuation.data));

  const projection = await request(`/intelligence/assets/${asset.id}/projection`, { token });
  const horizons = projection.data?.[0]?.payload?.horizons || projection.data?.horizons || projection.data?.payload?.scenarios;
  Array.isArray(horizons) || projection.ok
    ? pass('projection', horizons ? `${horizons.length || Object.keys(horizons).length} horizons` : 'present')
    : fail('projection', JSON.stringify(projection.data));

  const risk = await request(`/intelligence/assets/${asset.id}/risk`, { token });
  risk.ok ? pass('risk', risk.data?.[0]?.payload?.rating || risk.data?.rating || 'ok') : fail('risk', JSON.stringify(risk.data));

  // Marketplace listing
  const listing = await request('/marketplace/listings', {
    method: 'POST',
    token,
    body: { assetId: asset.id, quantityBps: 1000, askPrice: amount || 10_000_000 },
  });
  listing.ok
    ? pass('create listing', listing.data.id)
    : fail('create listing', JSON.stringify(listing.data));
  const listingId = listing.data?.id;

  // Trading match
  const order = await request('/trading/orders', {
    method: 'POST',
    token,
    body: {
      listingId,
      side: 'BUY',
      price: listing.data?.askPrice || amount || 10_000_000,
      quantityBps: 500,
      autoMatch: true,
    },
  });
  const tradeId = order.data?.trade?.id || order.data?.id;
  order.ok && (order.data?.trade || order.data?.status)
    ? pass('match trade', tradeId || order.data?.status)
    : fail('match trade', JSON.stringify(order.data));

  // Settlement
  const settlement = await request('/settlement', {
    method: 'POST',
    token,
    body: { tradeId: order.data?.trade?.id, method: 'OFF_CHAIN' },
  });
  settlement.ok
    ? pass('create settlement', settlement.data.id)
    : fail('create settlement', JSON.stringify(settlement.data));

  const completed = await request(`/settlement/${settlement.data.id}/complete`, {
    method: 'POST',
    token,
  });
  completed.ok && completed.data?.status === 'COMPLETED'
    ? pass('complete settlement', completed.data.status)
    : fail('complete settlement', JSON.stringify(completed.data));

  // Tokenization
  const mint = await request('/tokenization/tokens', {
    method: 'POST',
    token,
    body: { assetId: asset.id, supply: 100000 },
  });
  mint.ok && (mint.data?.mode === 'SIMULATED' || mint.data?.mode === 'LIVE')
    ? pass('tokenize Sepolia', `${mint.data.mode} · ${mint.data.status}`)
    : fail('tokenize Sepolia', JSON.stringify(mint.data));

  const network = await request('/tokenization/network', { token });
  network.ok && network.data?.chainId === 11155111
    ? pass('Sepolia network', `${network.data.mode} · rpc ${network.data.rpcProbe?.ok ? 'ok' : network.data.rpcProbe?.error || 'n/a'}`)
    : fail('Sepolia network', JSON.stringify(network.data));

  // Collateral: release existing active for this asset if any, then pledge
  const collaterals = await request('/collateral', { token });
  const existing = (collaterals.data ?? []).find(
    (item) => item.assetId === asset.id && item.status === 'ACTIVE',
  );
  if (existing) {
    if (!existing.canRelease) {
      for (const loan of existing.loans ?? []) {
        if (loan.status === 'ACTIVE') {
          await request(`/lending/${loan.id}/repay`, { method: 'POST', token });
        }
      }
    }
    const released = await request(`/collateral/${existing.id}/release`, { method: 'POST', token });
    released.ok || released.status === 400
      ? pass('prep release prior collateral', released.data?.status || released.data?.message || 'ok')
      : fail('prep release prior collateral', JSON.stringify(released.data));
  }

  const pledge = await request('/collateral', {
    method: 'POST',
    token,
    body: {
      assetId: asset.id,
      tokenId: mint.data?.id,
      haircutBps: 2000,
      pledgedValue: amount || 10_000_000,
    },
  });
  pledge.ok
    ? pass('pledge collateral', `adv ${pledge.data.advanceableValue} avail ${pledge.data.availableAmount}`)
    : fail('pledge collateral', JSON.stringify(pledge.data));

  const adjust = await request(`/collateral/${pledge.data.id}`, {
    method: 'PATCH',
    token,
    body: { haircutBps: 1500 },
  });
  adjust.ok && adjust.data.haircutBps === 1500
    ? pass('adjust collateral', `haircut ${adjust.data.haircutBps}`)
    : fail('adjust collateral', JSON.stringify(adjust.data));

  const principal = Math.min(1_000_000, Math.floor((pledge.data.advanceableValue || 0) * 0.2) || 1000);
  const loan = await request('/lending', {
    method: 'POST',
    token,
    body: { collateralId: pledge.data.id, principal },
  });
  loan.ok
    ? pass('open loan', `${loan.data.currency} ${loan.data.principal} LTV ${loan.data.ltvBps}`)
    : fail('open loan', JSON.stringify(loan.data));

  const blocked = await request(`/collateral/${pledge.data.id}/release`, { method: 'POST', token });
  blocked.status === 400
    ? pass('release blocked while loan active', blocked.data?.message)
    : fail('release blocked while loan active', `expected 400 got ${blocked.status}`);

  const repaid = await request(`/lending/${loan.data.id}/repay`, { method: 'POST', token });
  repaid.ok && repaid.data.status === 'REPAID'
    ? pass('repay loan', repaid.data.status)
    : fail('repay loan', JSON.stringify(repaid.data));

  const released = await request(`/collateral/${pledge.data.id}/release`, { method: 'POST', token });
  released.ok && released.data.status === 'RELEASED'
    ? pass('release collateral', released.data.status)
    : fail('release collateral', JSON.stringify(released.data));

  // Copilot briefing
  const copilot = await request('/intelligence/copilot', {
    method: 'POST',
    token,
    body: { assetId: asset.id, message: 'What is the current value and risk?' },
  });
  const briefing = copilot.data?.message?.briefing || copilot.data?.briefing || copilot.data?.reply?.briefing;
  briefing?.sections?.length
    ? pass('copilot briefing', `${briefing.title || 'briefing'} · ${briefing.sections.length} sections`)
    : copilot.ok
      ? pass('copilot answer', (copilot.data?.message?.content || copilot.data?.answer || 'ok').slice(0, 80))
      : fail('copilot', JSON.stringify(copilot.data));

  // Role checks: viewer-like compliance can read markets
  const sofia = await request('/auth/login', {
    method: 'POST',
    body: { email: 'sofia@meridian.caprov', password: 'CaprovDemo!23' },
  });
  if (sofia.ok) {
    const sofiaToken = sofia.data.token;
    const read = await request('/marketplace', { token: sofiaToken });
    read.ok ? pass('compliance can read marketplace', `${read.data.listings?.length ?? 0} listings`) : fail('compliance read', JSON.stringify(read.data));
    const write = await request('/marketplace/listings', {
      method: 'POST',
      token: sofiaToken,
      body: { assetId: asset.id, quantityBps: 100 },
    });
    write.status === 403
      ? pass('compliance blocked from listing write', '403')
      : fail('compliance blocked from listing write', `expected 403 got ${write.status}`);
  } else {
    fail('sofia login', JSON.stringify(sofia.data));
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} capital-markets/intelligence checks passed`);
  if (failed.length) {
    for (const item of failed) console.error(` - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log('Thorough capital-markets workflow passed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
