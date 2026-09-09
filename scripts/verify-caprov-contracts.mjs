#!/usr/bin/env node
/** Submit and poll Etherscan standard-JSON verification for the Sepolia contract suite. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { AbiCoder } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey) throw new Error('Set ETHERSCAN_API_KEY in apps/api/.env.');
const asset = process.env.ETHEREUM_TOKEN_CONTRACT;
const payment = process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT;
const marketplace = process.env.ETHEREUM_MARKETPLACE_CONTRACT;
if (!asset || !payment || !marketplace) throw new Error('Set all three deployed contract addresses.');
const files = ['CaprovAssetToken.sol', 'CaprovPaymentToken.sol', 'CaprovMarketplace.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(files.map((file) => [file, { content: readFileSync(resolve(process.cwd(), 'contracts', file), 'utf8') }])),
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};
const compilerVersion = `v${solc.version().split('.Emscripten')[0]}`;
const coder = AbiCoder.defaultAbiCoder();
const constructorArguments = {
  CaprovAssetToken: coder.encode(['string'], [process.env.CAPROV_TOKEN_URI || 'https://caprov.local/token/{id}.json']).slice(2),
  CaprovPaymentToken: '',
  CaprovMarketplace: coder.encode(['address', 'address'], [asset, payment]).slice(2),
};
const contracts = [
  ['CaprovAssetToken', asset],
  ['CaprovPaymentToken', payment],
  ['CaprovMarketplace', marketplace],
];
for (const [name, address] of contracts) {
  const body = new URLSearchParams({
    apikey: apiKey, chainid: '11155111', module: 'contract', action: 'verifysourcecode', contractaddress: address,
    sourceCode: JSON.stringify(input), codeformat: 'solidity-standard-json-input', contractname: `${name}.sol:${name}`,
    compilerversion: compilerVersion, optimizationUsed: '0', runs: '200', constructorArguments: constructorArguments[name], evmVersion: 'default', licenseType: '3',
  });
  const submitted = await fetch('https://api.etherscan.io/v2/api?chainid=11155111', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }).then((response) => response.json());
  if (submitted.status !== '1') throw new Error(`${name}: ${submitted.result}`);
  let result = 'Pending';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    const query = new URLSearchParams({ apikey: apiKey, chainid: '11155111', module: 'contract', action: 'checkverifystatus', guid: submitted.result });
    const status = await fetch(`https://api.etherscan.io/v2/api?${query}`).then((response) => response.json());
    result = status.result;
    if (/Pass|Fail|Already Verified/i.test(result)) break;
  }
  console.log(`${name}: ${result}`);
  if (!/Pass|Already Verified/i.test(result)) process.exitCode = 1;
}
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim(); const divider = line.indexOf('='); if (!line || line.startsWith('#') || divider < 1) continue;
    const key = line.slice(0, divider).trim(); let value = line.slice(divider + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value;
  }
}
