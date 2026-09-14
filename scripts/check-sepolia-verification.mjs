#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('apps/api/.env', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const contracts = [
  ['Asset token', env.ETHEREUM_TOKEN_CONTRACT],
  ['CAP token', env.ETHEREUM_PAYMENT_TOKEN_CONTRACT],
  ['Marketplace V2', env.ETHEREUM_MARKETPLACE_CONTRACT],
  ['Document registry', env.ETHEREUM_DOCUMENT_REGISTRY_CONTRACT],
];
for (const [name, address] of contracts) {
  const params = new URLSearchParams({ chainid: '11155111', module: 'contract', action: 'getsourcecode', address, apikey: env.ETHERSCAN_API_KEY });
  const payload = await fetch(`https://api.etherscan.io/v2/api?${params}`).then((response) => response.json());
  const result = payload.result?.[0];
  const reason = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result ?? payload.message);
  console.log(`${name}: ${result?.SourceCode ? 'VERIFIED' : `NOT VERIFIED (${reason})`}`);
  await new Promise((resolve) => setTimeout(resolve, 550));
}
