#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet, getAddress } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const rpc = process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const credential = process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY || process.env.ETHEREUM_SEPOLIA_MNEMONIC;
const owner = process.env.COLLATERAL_VAULT_OWNER;
const activator = process.env.COLLATERAL_VAULT_INITIAL_ACTIVATOR;
const releaseExecutor = process.env.COLLATERAL_VAULT_INITIAL_RELEASE_EXECUTOR || activator;
if (!credential || !owner || !activator) throw new Error('Set a signer plus COLLATERAL_VAULT_OWNER and COLLATERAL_VAULT_INITIAL_ACTIVATOR.');
const sourceName = 'CaprovCollateralVaultV2.sol';
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { [sourceName]: { content: readFileSync(resolve(process.cwd(), 'contracts', sourceName), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
})));
if (output.errors?.some((error) => error.severity === 'error')) throw new Error(output.errors.map((error) => error.formattedMessage).join('\n'));
const provider = new JsonRpcProvider(rpc, 11155111);
const signer = /^(0x)?[0-9a-fA-F]{64}$/.test(credential)
  ? new Wallet(credential.startsWith('0x') ? credential : `0x${credential}`, provider)
  : HDNodeWallet.fromPhrase(credential).connect(provider);
if (signer.address.toLowerCase() !== getAddress(owner).toLowerCase()) throw new Error('Deployment signer must be the requested initial owner.');
const artifact = output.contracts[sourceName].CaprovCollateralVaultV2;
const vault = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer).deploy(getAddress(owner));
await vault.waitForDeployment();
const address = await vault.getAddress();
const whitelistTx = await vault.setLoanActivator(getAddress(activator), true);
await whitelistTx.wait();
const releaseWhitelistTx = await vault.setReleaseExecutor(getAddress(releaseExecutor), true);
await releaseWhitelistTx.wait();
console.log(`Collateral vault V2: ${address}`);
console.log(`Deployment tx: ${vault.deploymentTransaction().hash}`);
console.log(`Jordan Lee whitelisting tx: ${whitelistTx.hash}`);
console.log(`Collateral-release executor whitelisting tx: ${releaseWhitelistTx.hash}`);

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
