import { Injectable } from '@nestjs/common';
import { Contract, JsonRpcProvider, getAddress, id as ethId, isAddress, zeroPadValue, toBeHex } from 'ethers';
import {
  DEFAULT_ETHEREUM_SEPOLIA_RPC,
  ETHEREUM_SEPOLIA_CHAIN_ID,
} from './ethereum-sepolia-token.service';

const VAULT_ABI = [
  'event CollateralLocked(uint256 indexed collateralId,address indexed borrower,address indexed assetToken,uint256 tokenId,uint256 units)',
  'event LoanActivated(uint256 indexed collateralId,address indexed lender,bytes32 indexed loanReference)',
  'event CollateralReleased(uint256 indexed collateralId,address indexed borrower)',
] as const;

/** Read-only verifier for collateral locks signed in MetaMask on Sepolia. */
@Injectable()
export class EthereumSepoliaCollateralVaultService {
  private address(): string | undefined {
    const value = process.env.ETHEREUM_COLLATERAL_VAULT_CONTRACT?.trim();
    return value && isAddress(value) ? getAddress(value) : undefined;
  }

  isConfigured() { return Boolean(this.address()); }

  async verifyLock(input: {
    txHash: string; collateralId: string; borrower: string; assetToken: string;
    tokenId: string; units: number;
  }) {
    const address = this.address();
    if (!address || !isAddress(input.borrower) || !isAddress(input.assetToken)) return false;
    const provider = new JsonRpcProvider(
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC,
      ETHEREUM_SEPOLIA_CHAIN_ID,
    );
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) return false;
    const vault = new Contract(address, VAULT_ABI, provider);
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== address.toLowerCase()) return false;
      try {
        const event = vault.interface.parseLog(log);
        return event?.name === 'CollateralLocked'
          && event.args.collateralId.toString() === input.collateralId
          && getAddress(event.args.borrower) === getAddress(input.borrower)
          && getAddress(event.args.assetToken) === getAddress(input.assetToken)
          && event.args.tokenId.toString() === input.tokenId
          && event.args.units.toString() === String(input.units);
      } catch { return false; }
    });
  }

  async verifyLoanActivation(input: { txHash: string; collateralId: string; loanReference: string }) {
    const address = this.address();
    if (!address) return false;
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC, ETHEREUM_SEPOLIA_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) return false;
    const vault = new Contract(address, VAULT_ABI, provider);
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== address.toLowerCase()) return false;
      try {
        const event = vault.interface.parseLog(log);
        return event?.name === 'LoanActivated'
          && event.args.collateralId.toString() === input.collateralId
          && event.args.loanReference.toLowerCase() === input.loanReference.toLowerCase();
      } catch { return false; }
    });
  }

  async hasLoanActivation(collateralId: string, loanReference: string) {
    const address = this.address();
    if (!address) return false;
    const provider = new JsonRpcProvider(process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC, ETHEREUM_SEPOLIA_CHAIN_ID);
    const logs = await provider.getLogs({
      address,
      topics: [ethId('LoanActivated(uint256,address,bytes32)'), zeroPadValue(toBeHex(BigInt(collateralId)), 32), null, loanReference],
      fromBlock: 0,
      toBlock: 'latest',
    });
    return logs.length > 0;
  }

  async verifyRepaymentRelease(input: {
    txHash: string;
    collateralId: string;
    borrower: string;
  }) {
    const address = this.address();
    if (!address || !isAddress(input.borrower)) return false;
    const provider = new JsonRpcProvider(
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC,
      ETHEREUM_SEPOLIA_CHAIN_ID,
    );
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) return false;
    const vault = new Contract(address, VAULT_ABI, provider);
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== address.toLowerCase()) return false;
      try {
        const event = vault.interface.parseLog(log);
        return (
          event?.name === 'CollateralReleased' &&
          event.args.collateralId.toString() === input.collateralId &&
          getAddress(event.args.borrower) === getAddress(input.borrower)
        );
      } catch {
        return false;
      }
    });
  }

  contractAddress() { return this.address(); }
}
