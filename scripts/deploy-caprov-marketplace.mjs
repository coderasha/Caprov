#!/usr/bin/env node
/** Deploy the ERC-1155 asset token, CAP ERC-20 payment token, and seller-approved settlement marketplace to Sepolia. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const rpc = process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const key = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY;
const mnemonic = process.env.ETHEREUM_SEPOLIA_MNEMONIC;
if (!key && !mnemonic) throw new Error('Set a funded ETHEREUM_SEPOLIA_PRIVATE_KEY or ETHEREUM_SEPOLIA_MNEMONIC.');
const sources = Object.fromEntries(['CaprovAssetToken.sol', 'CaprovPaymentToken.sol', 'CaprovMarketplaceSettlementV2.sol'].map((name) => [name, { content: readFileSync(resolve(process.cwd(), 'contracts', name), 'utf8') }]));
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } } })));
if (output.errors?.some((error) => error.severity === 'error')) throw new Error(output.errors.map((error) => error.formattedMessage).join('\n'));
const provider = new JsonRpcProvider(rpc, 11155111);
const wallet = key ? new Wallet(key, provider) : HDNodeWallet.fromPhrase(mnemonic).connect(provider);
const deploy = async (file, name, args = []) => {
  const artifact = output.contracts[file][name];
  const contract = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, wallet).deploy(...args);
  await contract.waitForDeployment();
  return contract.getAddress();
};
const asset = await deploy('CaprovAssetToken.sol', 'CaprovAssetToken', [process.env.CAPROV_TOKEN_URI || 'https://caprov.local/token/{id}.json']);
const payment = await deploy('CaprovPaymentToken.sol', 'CaprovPaymentToken');
const marketplace = await deploy('CaprovMarketplaceSettlementV2.sol', 'CaprovMarketplaceSettlementV2', [asset, payment]);
console.log(`Asset token: ${asset}`);
console.log(`Payment token: ${payment}`);
console.log(`Marketplace: ${marketplace}`);
console.log(`Set ETHEREUM_TOKEN_CONTRACT=${asset}`);
console.log(`Set ETHEREUM_PAYMENT_TOKEN_CONTRACT=${payment}`);
console.log(`Set ETHEREUM_MARKETPLACE_CONTRACT=${marketplace}`);
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim(); const divider = line.indexOf('='); if (!line || line.startsWith('#') || divider < 1) continue;
    const name = line.slice(0, divider).trim(); let value = line.slice(divider + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[name] == null) process.env[name] = value;
  }
}
