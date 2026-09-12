import { Injectable } from '@nestjs/common';
import { Contract, JsonRpcProvider, getAddress, isAddress } from 'ethers';
import {
  DEFAULT_ETHEREUM_SEPOLIA_RPC,
  ETHEREUM_SEPOLIA_CHAIN_ID,
} from './ethereum-sepolia-token.service';

const MARKETPLACE_ABI = [
  'function assetToken() view returns (address)',
  'function listings(uint256) view returns (address seller, uint256 assetId, uint256 remaining, uint256 pricePerUnit, bool active)',
  'event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 amount, uint256 pricePerUnit)',
  'event Purchased(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 cost)',
  'event ListingClosed(uint256 indexed listingId)',
] as const;

export interface OnChainListing {
  seller: string;
  assetTokenId: string;
  remaining: string;
  pricePerTokenWei: string;
  active: boolean;
}

/** Read-only verification of MetaMask-signed marketplace activity. */
@Injectable()
export class EthereumSepoliaMarketplaceService {
  private address(): string | undefined {
    const value = process.env.ETHEREUM_MARKETPLACE_CONTRACT?.trim();
    return value && isAddress(value) ? getAddress(value) : undefined;
  }

  isConfigured() {
    return Boolean(this.address() && process.env.ETHEREUM_PAYMENT_TOKEN_CONTRACT?.trim());
  }

  /** The marketplace's immutable ERC-1155 address is the source of truth. */
  async getAssetTokenAddress(): Promise<string | null> {
    const address = this.address();
    if (!address) return null;
    const provider = new JsonRpcProvider(
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC,
      ETHEREUM_SEPOLIA_CHAIN_ID,
    );
    const market = new Contract(address, MARKETPLACE_ABI, provider);
    return getAddress(await market.getFunction('assetToken')());
  }

  async getListing(listingId: string): Promise<OnChainListing | null> {
    const address = this.address();
    if (!address) return null;
    const provider = new JsonRpcProvider(
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC,
      ETHEREUM_SEPOLIA_CHAIN_ID,
    );
    const market = new Contract(address, MARKETPLACE_ABI, provider);
    const row = await market.getFunction('listings')(BigInt(listingId));
    return {
      seller: getAddress(row.seller),
      assetTokenId: row.assetId.toString(),
      remaining: row.remaining.toString(),
      pricePerTokenWei: row.pricePerUnit.toString(),
      active: row.active,
    };
  }

  async verifyListingTransaction(input: {
    txHash: string;
    listingId: string;
    seller: string;
    assetTokenId: string;
    units: string;
    pricePerTokenWei: string;
  }) {
    const address = this.address();
    if (!address) return false;
    const provider = new JsonRpcProvider(
      process.env.ETHEREUM_SEPOLIA_RPC_URL?.trim() || DEFAULT_ETHEREUM_SEPOLIA_RPC,
      ETHEREUM_SEPOLIA_CHAIN_ID,
    );
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) return false;
    const contract = new Contract(address, MARKETPLACE_ABI, provider);
    return receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== address.toLowerCase()) return false;
      try {
        const event = contract.interface.parseLog(log);
        return event?.name === 'Listed'
          && event.args.listingId.toString() === input.listingId
          && getAddress(event.args.seller) === getAddress(input.seller)
          && event.args.assetId.toString() === input.assetTokenId
          && event.args.amount.toString() === input.units
          && event.args.pricePerUnit.toString() === input.pricePerTokenWei;
      } catch { return false; }
    });
  }

  contractAddress() { return this.address(); }
}
