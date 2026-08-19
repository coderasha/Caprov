#!/usr/bin/env node
/**
 * Deploy CaprovAssetToken to Ethereum Sepolia.
 *
 *   ETHEREUM_SEPOLIA_PRIVATE_KEY=0x... node scripts/deploy-caprov-token.mjs
 *
 * Optional: ETHEREUM_SEPOLIA_RPC_URL (defaults to https://ethereum-sepolia-rpc.publicnode.com)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet } from 'ethers';

loadLocalEnv(resolve(process.cwd(), 'apps/api/.env'));

const RPC = process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const KEY = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY;
const MNEMONIC = process.env.ETHEREUM_SEPOLIA_MNEMONIC;
if (!KEY && !MNEMONIC) {
  console.error('Set ETHEREUM_SEPOLIA_PRIVATE_KEY or ETHEREUM_SEPOLIA_MNEMONIC to a Sepolia-funded wallet.');
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), 'contracts/CaprovAssetToken.sol');
const source = readFileSync(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'CaprovAssetToken.sol': { content: source } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};

let output;
try {
  output = JSON.parse(solc.compile(JSON.stringify(input)));
} catch (error) {
  console.error('solc is required: pnpm add -Dw solc');
  console.error(error);
  process.exit(1);
}

const artifact = output.contracts?.['CaprovAssetToken.sol']?.CaprovAssetToken;
if (!artifact?.evm?.bytecode?.object) {
  console.error(JSON.stringify(output.errors ?? output, null, 2));
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC, 11155111);
const wallet = KEY ? new Wallet(KEY, provider) : HDNodeWallet.fromPhrase(MNEMONIC).connect(provider);
const factory = new ContractFactory(artifact.abi, '0x' + artifact.evm.bytecode.object, wallet);
const uri = process.env.CAPROV_TOKEN_URI || 'https://caprov.local/token/{id}.json';
console.log(`Deploying from ${wallet.address} on Sepolia...`);
const contract = await factory.deploy(uri);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`CaprovAssetToken deployed: ${address}`);
console.log(`Explorer: https://sepolia.etherscan.io/address/${address}`);
console.log(`Set ETHEREUM_TOKEN_CONTRACT=${address} in apps/api/.env`);

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
