#!/usr/bin/env node
/**
 * Creates and starts Besu's official four-validator private quickstart network,
 * deploys all CAPROV contracts, and prints the API/web configuration to copy.
 * This is development-only: its prefunded private key is intentionally public.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'infra/besu/local-network');
// Besu's official multi-validator quickstart publishes validator1 RPC on 21001.
const rpc = process.env.BESU_RPC_URL || 'http://127.0.0.1:21001';
const privateKey = process.env.BESU_PRIVATE_KEY || '0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63';

if (!existsSync(output)) {
  execFileSync('npx', ['--yes', '@consensys-software/besu-dev-quickstart', '--networkType', 'private', '--outputPath', output, '--otel', 'false', '--chainlens', 'false'], { cwd: root, stdio: 'inherit' });
}
execFileSync('docker', ['compose', 'up', '-d'], { cwd: output, stdio: 'inherit' });
await waitForRpc(rpc);
const environment = { ...process.env, BESU_RPC_URL: rpc, BESU_CHAIN_ID: '1337', BESU_PRIVATE_KEY: privateKey };
execFileSync('node', ['scripts/deploy-besu-suite.mjs'], { cwd: root, env: environment, stdio: 'inherit' });
console.log('\nCopy the printed BESU_* contract addresses into apps/api/.env and the matching NEXT_PUBLIC_BESU_* values into apps/web/.env.local, then restart both applications.');

async function waitForRpc(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
      if (response.ok) return;
    } catch { /* Besu is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Besu RPC did not become available at ${url}.`);
}
