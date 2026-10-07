export const SEPOLIA_EXPLORER_BASE = 'https://sepolia.etherscan.io';

const TX_HASH = /0x[a-fA-F0-9]{64}/;

/** Returns a transaction URL for the currently configured EVM network. */
export function transactionExplorerUrl(
  hashOrUrl?: string | null,
  explorerBase?: string,
): string | undefined {
  if (!hashOrUrl?.trim()) {
    return undefined;
  }
  const value = hashOrUrl.trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const hash = value.match(TX_HASH)?.[0];
  if (!hash || !explorerBase) {
    return undefined;
  }
  return `${explorerBase.replace(/\/$/, '')}/tx/${hash}`;
}

/** @deprecated Pass the selected network's explorer to transactionExplorerUrl. */
export function sepoliaTxExplorerUrl(hashOrUrl?: string | null): string | undefined {
  return transactionExplorerUrl(hashOrUrl, SEPOLIA_EXPLORER_BASE);
}
