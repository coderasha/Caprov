import { selectedBlockchainNetwork } from './blockchain-network';

export const SEPOLIA_EXPLORER_BASE = 'https://sepolia.etherscan.io';

const TX_HASH = /0x[a-fA-F0-9]{64}/;

export function sepoliaTxExplorerUrl(hashOrUrl?: string | null): string | undefined {
  if (!hashOrUrl?.trim()) {
    return undefined;
  }
  const value = hashOrUrl.trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const hash = value.match(TX_HASH)?.[0];
  if (!hash) {
    return undefined;
  }
  const explorer = selectedBlockchainNetwork().blockExplorerUrl;
  return explorer ? `${explorer.replace(/\/$/, '')}/tx/${hash}` : undefined;
}

/** Uses the explorer recorded with the transaction, falling back to the active network. */
export function transactionExplorerUrl(
  hashOrUrl?: string | null,
  explorerUrl?: string | null,
): string | undefined {
  if (explorerUrl?.trim()) {
    const recorded = explorerUrl.trim();
    if (/^https?:\/\//i.test(recorded)) {
      return recorded;
    }
  }
  return sepoliaTxExplorerUrl(hashOrUrl);
}
