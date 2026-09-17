#!/usr/bin/env node
/** Submit and poll Etherscan verification for the live Sepolia collateral vault. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';

const apiKey = process.env.ETHERSCAN_API_KEY;
const address = process.env.ETHEREUM_COLLATERAL_VAULT_CONTRACT;
if (!apiKey) throw new Error('Set ETHERSCAN_API_KEY for this command.');
if (!address) throw new Error('Set ETHEREUM_COLLATERAL_VAULT_CONTRACT for this command.');

const sourceName = process.env.COLLATERAL_VAULT_SOURCE || 'CaprovCollateralVault.sol';
const contractName = process.env.COLLATERAL_VAULT_CONTRACT_NAME || 'CaprovCollateralVault';
const input = {
  language: 'Solidity',
  sources: {
    [sourceName]: {
      content: readFileSync(resolve(process.cwd(), 'contracts', sourceName), 'utf8'),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
};
const compilerVersion = `v${solc.version().split('.Emscripten')[0]}`;
const endpoint = 'https://api.etherscan.io/v2/api';
const submission = await call(new URLSearchParams({
  apikey: apiKey,
  chainid: '11155111',
  module: 'contract',
  action: 'verifysourcecode',
  contractaddress: address,
  sourceCode: JSON.stringify(input),
  codeformat: 'solidity-standard-json-input',
  contractname: `${sourceName}:${contractName}`,
  compilerversion: compilerVersion,
  optimizationUsed: '1',
  runs: '200',
  constructorArguments: '',
  evmVersion: 'default',
  licenseType: '3',
}));
if (submission.status !== '1') throw new Error(`Verification submission failed: ${submission.result}`);

console.log(`Submitted verification: ${submission.result}`);
for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  const status = await call(new URLSearchParams({
    apikey: apiKey, chainid: '11155111', module: 'contract',
    action: 'checkverifystatus', guid: submission.result,
  }), 'GET');
  console.log(status.result);
  if (/Pass|Already Verified/i.test(status.result)) process.exit(0);
  if (/Fail/i.test(status.result)) process.exit(1);
}
process.exitCode = 1;

async function call(params, method = 'POST') {
  const response = method === 'GET'
    ? await fetch(`${endpoint}?${params}`)
    : await fetch(`${endpoint}?chainid=11155111`, {
      method,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  return response.json();
}
