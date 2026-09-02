#!/usr/bin/env node
/**
 * Deploy CaprovDocumentRegistry to Ethereum Sepolia.
 *
 *   ETHEREUM_SEPOLIA_PRIVATE_KEY=0x... node scripts/deploy-document-registry.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { ContractFactory, JsonRpcProvider, Wallet, HDNodeWallet } from 'ethers';

loadLocalEnv(resolve(process.cwd(), 'apps/api/.env'));

const RPC = process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const KEY = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY;
const MNEMONIC = process.env.ETHEREUM_SEPOLIA_MNEMONIC;
if (!KEY && !MNEMONIC) {
  console.error('Set ETHEREUM_SEPOLIA_PRIVATE_KEY or ETHEREUM_SEPOLIA_MNEMONIC to a Sepolia-funded wallet.');
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), 'contracts/CaprovDocumentRegistry.sol');
const source = readFileSync(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'CaprovDocumentRegistry.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
};

let output;
try {
  output = JSON.parse(solc.compile(JSON.stringify(input)));
} catch (error) {
  console.error('solc is required: pnpm add -Dw solc');
  console.error(error);
  process.exit(1);
}

const artifact = output.contracts?.['CaprovDocumentRegistry.sol']?.CaprovDocumentRegistry;
if (!artifact?.evm?.bytecode?.object) {
  console.error(JSON.stringify(output.errors ?? output, null, 2));
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC, 11155111);
const wallet = MNEMONIC
  ? HDNodeWallet.fromPhrase(MNEMONIC).connect(provider)
  : new Wallet(KEY, provider);
const factory = new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, wallet);
console.log(`Deploying from ${wallet.address} on Sepolia...`);
const contract = await factory.deploy();
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`CaprovDocumentRegistry deployed: ${address}`);
console.log(`Explorer: https://sepolia.etherscan.io/address/${address}`);
console.log(`Set ETHEREUM_DOCUMENT_REGISTRY_CONTRACT=${address} in apps/api/.env`);

function loadLocalEnv(filePath) {
  const source = readFileSync(filePath, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) {
      continue;
    }
    const value = trimmed.slice(separator + 1);
    process.env[key] = value;
  }
}
