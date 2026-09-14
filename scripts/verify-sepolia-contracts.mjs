#!/usr/bin/env node
/** Submit and poll Etherscan standard-JSON verification for all deployed Sepolia contracts. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { AbiCoder } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const apiKey = process.env.ETHERSCAN_API_KEY;
const asset = process.env.ETHEREUM_TOKEN_CONTRACT;
const payment = process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT;
const marketplace = process.env.ETHEREUM_MARKETPLACE_CONTRACT;
const registry = process.env.ETHEREUM_DOCUMENT_REGISTRY_CONTRACT;
if (!apiKey) throw new Error('Set ETHERSCAN_API_KEY in apps/api/.env.');
if (!asset || !payment || !marketplace || !registry) throw new Error('Set all four deployed contract addresses in apps/api/.env.');

const compilerVersion = `v${solc.version().split('.Emscripten')[0]}`;
const coder = AbiCoder.defaultAbiCoder();
const marketplaceSources = ['CaprovAssetToken.sol', 'CaprovPaymentToken.sol', 'CaprovMarketplaceSettlementV2.sol'];
const marketplaceInput = standardInput(marketplaceSources, {});
const registryInput = standardInput(['CaprovDocumentRegistry.sol'], { optimizer: { enabled: true, runs: 200 }, viaIR: true });
const constructors = {
  CaprovAssetToken: coder.encode(['string'], [process.env.CAPROV_TOKEN_URI || 'https://caprov.local/token/{id}.json']).slice(2),
  CaprovPaymentToken: '',
  CaprovMarketplaceSettlementV2: coder.encode(['address', 'address'], [asset, payment]).slice(2),
  CaprovDocumentRegistry: '',
};
const contracts = [
  { name: 'CaprovAssetToken', file: 'CaprovAssetToken.sol', address: asset, input: marketplaceInput, optimizationUsed: '0', runs: '200' },
  { name: 'CaprovPaymentToken', file: 'CaprovPaymentToken.sol', address: payment, input: marketplaceInput, optimizationUsed: '0', runs: '200' },
  { name: 'CaprovMarketplaceSettlementV2', file: 'CaprovMarketplaceSettlementV2.sol', address: marketplace, input: marketplaceInput, optimizationUsed: '0', runs: '200' },
  { name: 'CaprovDocumentRegistry', file: 'CaprovDocumentRegistry.sol', address: registry, input: registryInput, optimizationUsed: '1', runs: '200' },
];
const requestedNames = process.env.VERIFY_ONLY?.split(',').map((value) => value.trim()).filter(Boolean);
const targets = requestedNames?.length ? contracts.filter((contract) => requestedNames.includes(contract.name)) : contracts;
if (requestedNames?.length && targets.length !== requestedNames.length) throw new Error('VERIFY_ONLY contains an unknown contract name.');

for (const contract of targets) {
  const body = new URLSearchParams({
    apikey: apiKey, chainid: '11155111', module: 'contract', action: 'verifysourcecode', contractaddress: contract.address,
    sourceCode: JSON.stringify(contract.input), codeformat: 'solidity-standard-json-input', contractname: `${contract.file}:${contract.name}`,
    compilerversion: compilerVersion, optimizationUsed: contract.optimizationUsed, runs: contract.runs,
    constructorArguments: constructors[contract.name], evmVersion: 'default', licenseType: '3',
  });
  const submitted = await etherscan(body);
  console.log(`${contract.name}: submission ${submitted.result}`);
  if (submitted.status !== '1') {
    console.error(`${contract.name}: ${submitted.result}`);
    process.exitCode = 1;
    continue;
  }
  let result = 'Pending';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    const status = await etherscan(new URLSearchParams({ apikey: apiKey, chainid: '11155111', module: 'contract', action: 'checkverifystatus', guid: submitted.result }), 'GET');
    result = status.result;
    if (/Pass|Fail|Already Verified/i.test(result)) break;
  }
  console.log(`${contract.name}: ${result}`);
  if (!/Pass|Already Verified/i.test(result)) process.exitCode = 1;
}

function standardInput(files, settings) {
  return {
    language: 'Solidity',
    sources: Object.fromEntries(files.map((file) => [file, { content: readFileSync(resolve(process.cwd(), 'contracts', file), 'utf8') }])),
    settings: { ...settings, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
  };
}

async function etherscan(params, method = 'POST') {
  const url = 'https://api.etherscan.io/v2/api?chainid=11155111';
  const response = method === 'GET'
    ? await fetch(`${url}&${params}`)
    : await fetch(url, { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  return response.json();
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim(); const divider = line.indexOf('=');
    if (!line || line.startsWith('#') || divider < 1) continue;
    const key = line.slice(0, divider).trim(); let value = line.slice(divider + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value;
  }
}
