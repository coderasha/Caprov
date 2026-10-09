import { Injectable } from '@nestjs/common';
import { Contract, HDNodeWallet, JsonRpcProvider, Wallet, getAddress, id as ethId, isAddress, zeroPadValue, toBeHex } from 'ethers';
import {
  DEFAULT_ETHEREUM_SEPOLIA_RPC,
  ETHEREUM_SEPOLIA_CHAIN_ID,
} from './ethereum-sepolia-token.service';
import { BlockchainNetworkService } from './blockchain-network.service';

const VAULT_ABI = [
  'function loanActivators(address) view returns(bool)',
  'function releaseExecutors(address) view returns(bool)',
  'function setLoanActivator(address account,bool allowed)',
  'function setReleaseExecutor(address account,bool allowed)',
  'event CollateralLocked(uint256 indexed collateralId,address indexed borrower,address indexed assetToken,uint256 tokenId,uint256 units)',
  'event LoanActivated(uint256 indexed collateralId,address indexed lender,bytes32 indexed loanReference)',
  'event CollateralReleased(uint256 indexed collateralId,address indexed borrower)',
] as const;

/** Read-only verifier for collateral locks signed in MetaMask on Sepolia. */
@Injectable()
export class EthereumSepoliaCollateralVaultService {
  constructor(private readonly networks: BlockchainNetworkService) {}
  private address(): string | undefined {
    const value = this.networks.selected().collateralVaultContract;
    return value && isAddress(value) ? getAddress(value) : undefined;
  }

  isConfigured() { return Boolean(this.address()); }

  /**
   * A BANKER has application-level authority to operate facilities, while the
   * vault independently requires that wallet to be whitelisted. The configured
   * vault-owner signer performs that one-time on-chain authorization so the
   * banker can subsequently sign activation/release transactions themselves.
   */
  async authorizeBankExecutor(walletAddress: string) {
    const address = this.address();
    if (!address) throw new Error('The active network collateral vault is not configured.');
    if (!isAddress(walletAddress)) throw new Error('A valid MetaMask wallet address is required.');
    const network = this.networks.selected();
    if (!network.privateKey && !network.mnemonic) {
      throw new Error(`The ${network.chainName} vault-owner signer is not configured.`);
    }
    const provider = new JsonRpcProvider(network.rpcUrl, network.chainId);
    const signer = network.privateKey
      ? new Wallet(network.privateKey, provider)
      : HDNodeWallet.fromPhrase(network.mnemonic!).connect(provider);
    const vault = new Contract(address, VAULT_ABI, signer);
    const executor = getAddress(walletAddress);
    const overrides = network.zeroGas ? { gasPrice: 0n } : {};
    const transactions: string[] = [];
    const isLoanActivator = vault.getFunction('loanActivators');
    const setLoanActivator = vault.getFunction('setLoanActivator');
    const isReleaseExecutor = vault.getFunction('releaseExecutors');
    const setReleaseExecutor = vault.getFunction('setReleaseExecutor');
    if (!await isLoanActivator(executor)) {
      const tx = await setLoanActivator(executor, true, overrides);
      await tx.wait();
      transactions.push(tx.hash);
    }
    if (!await isReleaseExecutor(executor)) {
      const tx = await setReleaseExecutor(executor, true, overrides);
      await tx.wait();
      transactions.push(tx.hash);
    }
    return { walletAddress: executor, transactions };
  }

  async verifyLock(input: {
    txHash: string; collateralId: string; borrower: string; assetToken: string;
    tokenId: string; units: number;
  }) {
    const address = this.address();
    if (!address || !isAddress(input.borrower) || !isAddress(input.assetToken)) return false;
    const provider = new JsonRpcProvider(
      this.networks.selected().rpcUrl, this.networks.selected().chainId,
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
    const provider = new JsonRpcProvider(this.networks.selected().rpcUrl, this.networks.selected().chainId);
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
    const provider = new JsonRpcProvider(this.networks.selected().rpcUrl, this.networks.selected().chainId);
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
      this.networks.selected().rpcUrl, this.networks.selected().chainId,
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
