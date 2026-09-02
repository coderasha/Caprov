export const SEPOLIA_EXPLORER_BASE = 'https://sepolia.etherscan.io';

const TX_HASH = /0x[a-fA-F0-9]{64}/;

export function sepoliaTxExplorerUrl(hashOrUrl?: string | null): string | undefined {
  if (!hashOrUrl?.trim()) {
    return undefined;
  }
  const value = hashOrUrl.trim();
  const hash = value.match(TX_HASH)?.[0];
  if (!hash) {
    return undefined;
  }
  return `${SEPOLIA_EXPLORER_BASE}/tx/${hash}`;
}
