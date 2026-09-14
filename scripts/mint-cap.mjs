#!/usr/bin/env node
/** Mint real Sepolia CAP to a buyer wallet. Requires the CAP owner deployment wallet. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Contract, JsonRpcProvider, Wallet, parseUnits } from 'ethers';

loadEnv(resolve(process.cwd(), 'apps/api/.env'));
const recipient = process.env.CAP_RECIPIENT;
const amount = process.env.CAP_AMOUNT;
if (!recipient || !amount) throw new Error('Set CAP_RECIPIENT=0x... and CAP_AMOUNT=<whole CAP amount>.');
const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL, 11155111);
const wallet = new Wallet(process.env.ETHEREUM_SEPOLIA_PRIVATE_KEY, provider);
const cap = new Contract(process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT, ['function mint(address to, uint256 value) external'], wallet);
const tx = await cap.mint(recipient, parseUnits(amount, 18));
await tx.wait();
console.log(`Minted ${amount} CAP to ${recipient}: https://sepolia.etherscan.io/tx/${tx.hash}`);

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = line.slice(index + 1).trim();
  }
}
