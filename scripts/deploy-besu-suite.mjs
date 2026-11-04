#!/usr/bin/env node
/** Deploy PRIVATEASSETZ's complete EVM contract suite to the configured zero-fee Besu network. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet, getAddress } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const rpc = process.env.BESU_RPC_URL || 'http://127.0.0.1:8545';
const chainId = Number(process.env.BESU_CHAIN_ID || 1337);
const credential = process.env.BESU_PRIVATE_KEY || process.env.BESU_MNEMONIC;
if (!credential) throw new Error('Set BESU_PRIVATE_KEY or BESU_MNEMONIC.');
const files = ['PrivateAssetzAssetToken.sol', 'PrivateAssetzPaymentToken.sol', 'PrivateAssetzMarketplaceSettlementV2.sol', 'PrivateAssetzDocumentRegistry.sol', 'PrivateAssetzCollateralVaultV2.sol'];
const sources = Object.fromEntries(files.map((name) => [name, { content: readFileSync(resolve(process.cwd(), 'contracts', name), 'utf8') }]));
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } } })));
if (output.errors?.some((entry) => entry.severity === 'error')) throw new Error(output.errors.map((entry) => entry.formattedMessage).join('\n'));
const provider = new JsonRpcProvider(rpc, chainId);
const signer = /^(0x)?[0-9a-fA-F]{64}$/.test(credential) ? new Wallet(credential.startsWith('0x') ? credential : `0x${credential}`, provider) : HDNodeWallet.fromPhrase(credential).connect(provider);
const deploy = async (file, name, args = []) => { const artifact = output.contracts[file][name]; const contract = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer).deploy(...args, { gasPrice: 0n }); await contract.waitForDeployment(); return contract.getAddress(); };
const asset = await deploy('PrivateAssetzAssetToken.sol', 'PrivateAssetzAssetToken', [process.env.PRIVATEASSETZ_TOKEN_URI || 'https://privateassetz.local/token/{id}.json']);
const payment = await deploy('PrivateAssetzPaymentToken.sol', 'PrivateAssetzPaymentToken');
const marketplace = await deploy('PrivateAssetzMarketplaceSettlementV2.sol', 'PrivateAssetzMarketplaceSettlementV2', [asset, payment]);
const registry = await deploy('PrivateAssetzDocumentRegistry.sol', 'PrivateAssetzDocumentRegistry');
const vault = await deploy('PrivateAssetzCollateralVaultV2.sol', 'PrivateAssetzCollateralVaultV2', [getAddress(process.env.BESU_VAULT_OWNER || signer.address)]);
console.log(`BESU_ASSET_TOKEN_CONTRACT=${asset}\nBESU_PAYMENT_TOKEN_CONTRACT=${payment}\nBESU_MARKETPLACE_CONTRACT=${marketplace}\nBESU_DOCUMENT_REGISTRY_CONTRACT=${registry}\nBESU_COLLATERAL_VAULT_CONTRACT=${vault}`);
function loadEnv(path) { if (!existsSync(path)) return; for (const raw of readFileSync(path, 'utf8').split('\n')) { const line = raw.trim(); const divider = line.indexOf('='); if (!line || line.startsWith('#') || divider < 1) continue; const key = line.slice(0, divider).trim(); let value = line.slice(divider + 1).trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); if (process.env[key] == null) process.env[key] = value; } }
