import { BrowserProvider, Contract, Interface, type Eip1193Provider, formatUnits, parseUnits } from 'ethers';

const assetAbi = [
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
] as const;
const paymentAbi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
] as const;
const marketplaceAbi = [
  'function createListing(uint256 assetId, uint256 amount, uint256 pricePerUnit) returns (uint256)',
  'function requestPurchase(uint256 listingId, uint256 units) returns (uint256)',
  'function approveSettlement(uint256 purchaseId)',
  'function rejectSettlement(uint256 purchaseId)',
  'function closeListing(uint256 listingId)',
  'event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 amount, uint256 pricePerUnit)',
  'event PurchaseRequested(uint256 indexed purchaseId, uint256 indexed listingId, address indexed buyer, uint256 units, uint256 paymentCAP)',
] as const;

type WalletWindow = Window & { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } };

export interface WalletOption {
  id: string;
  name: string;
  rdns?: string;
}

type WalletProvider = Eip1193Provider & {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
};

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: WalletProvider;
};

let activeWallet: { id: string; provider: WalletProvider } | undefined;
let activeAccount: string | undefined;

async function metaMaskWallet() {
  const wallets = await availableSepoliaWallets();
  // Do not use `isMetaMask`: Keplr, Core, and other extensions can expose it
  // for compatibility. EIP-6963's reverse-DNS identity is unambiguous.
  const wallet = wallets.find((item) => item.rdns === 'io.metamask');
  if (!wallet) throw new Error('MetaMask was not discovered. Unlock the official MetaMask extension, refresh this page, and try again.');
  return wallet;
}

function providerName(provider: WalletProvider) {
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isRabby) return 'Rabby Wallet';
  if (provider.isBraveWallet) return 'Brave Wallet';
  return 'Browser wallet';
}

/**
 * Finds injected wallets through EIP-6963. This prevents whichever extension
 * last assigned window.ethereum from silently controlling a transaction.
 */
export async function availableSepoliaWallets(): Promise<Array<WalletOption & { provider: WalletProvider }>> {
  if (typeof window === 'undefined') return [];
  const found: Array<WalletOption & { provider: WalletProvider }> = [];
  const add = (id: string, name: string, provider: WalletProvider, rdns?: string) => {
    if (!found.some((wallet) => wallet.provider === provider)) found.push({ id, name, provider, rdns });
  };
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (detail?.provider && detail.info?.uuid) add(detail.info.uuid, detail.info.name, detail.provider, detail.info.rdns);
  };
  window.addEventListener('eip6963:announceProvider', announce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  window.removeEventListener('eip6963:announceProvider', announce);

  const ethereum = (window as WalletWindow).ethereum;
  if (ethereum) {
    const legacyProviders = ethereum.providers?.length ? ethereum.providers : [ethereum];
    legacyProviders.forEach((provider, index) => add(`legacy-${index}`, providerName(provider as WalletProvider), provider as WalletProvider));
  }
  return found;
}

/** Resolves MetaMask specifically; marketplace transactions never fall back to another extension. */
export async function connectMetaMaskWallet() {
  const metaMask = await metaMaskWallet();
  activeWallet = { id: metaMask.id, provider: metaMask.provider };
  // Explicitly request the eth_accounts permission from a user click. MetaMask
  // uses this native flow to let the user choose which account(s) CAPROV may use.
  await metaMask.provider.request({
    method: 'wallet_requestPermissions',
    params: [{ eth_accounts: {} }],
  });
  activeAccount = undefined;
  const connectedSigner = await signer();
  const address = await connectedSigner.getAddress();
  const accounts = await metaMask.provider.request({ method: 'eth_accounts' }) as string[];
  return { address, accounts };
}

/** Selects a MetaMask account that the extension has explicitly exposed to this site. */
export async function selectMetaMaskAccount(account: string) {
  const provider = await selectedProvider();
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  const match = accounts.find((item) => item.toLowerCase() === account.toLowerCase());
  if (!match) throw new Error('This account is not connected to CAPROV in MetaMask. Reconnect the site in MetaMask and select that account.');
  activeAccount = match;
  return activeAccount;
}

function addresses() {
  const assetToken = process.env.NEXT_PUBLIC_ETHEREUM_ASSET_TOKEN_CONTRACT;
  const paymentToken = process.env.NEXT_PUBLIC_ETHEREUM_PAYMENT_TOKEN_CONTRACT;
  const marketplace = process.env.NEXT_PUBLIC_ETHEREUM_MARKETPLACE_CONTRACT;
  if (!assetToken || !paymentToken || !marketplace) {
    throw new Error('Sepolia marketplace contracts are not configured for this web app.');
  }
  return { assetToken, paymentToken, marketplace };
}

/**
 * The listing form accepts a total USD/CAP asking price, while the settlement
 * contract prices each ERC-1155 unit. Avoid a silent rounding difference
 * between the displayed total and the amount that can be escrowed on-chain.
 */
export function capPricePerUnitFromTotal(totalPrice: string, units: string) {
  const totalWei = parseUnits(totalPrice, 18);
  const unitCount = BigInt(units);
  if (totalWei <= 0n || unitCount <= 0n) throw new Error('Enter a positive total asking price and token supply.');
  if (totalWei % unitCount !== 0n) {
    throw new Error('The total asking price must divide exactly across all token units (up to 18 CAP decimals).');
  }
  return formatUnits(totalWei / unitCount, 18);
}

async function selectedProvider(walletId?: string) {
  if (walletId || !activeWallet) {
    const wallets = await availableSepoliaWallets();
    const wallet = wallets.find((item) => item.id === walletId)
      ?? wallets.find((item) => item.id === activeWallet?.id)
      ?? await metaMaskWallet();
    if (wallet.rdns !== 'io.metamask') throw new Error('Marketplace transactions must use MetaMask.');
    activeWallet = { id: wallet.id, provider: wallet.provider };
  }
  return activeWallet.provider;
}

async function signer(walletId?: string) {
  const provider = new BrowserProvider(await selectedProvider(walletId));
  const requestedAccounts = await provider.send('eth_requestAccounts', []) as string[];
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error('Switch your wallet to Ethereum Sepolia (chain ID 11155111).');
  }
  const account = activeAccount && requestedAccounts.find((item) => item.toLowerCase() === activeAccount?.toLowerCase())
    ? activeAccount
    : requestedAccounts[0];
  if (!account) throw new Error('MetaMask did not expose an account to CAPROV.');
  return provider.getSigner(account);
}

export async function connectSepoliaWallet(walletId?: string) {
  const connectedSigner = await signer(walletId);
  return connectedSigner.getAddress();
}

/** Confirms the connected lister holds enough units on the configured ERC-1155. */
export async function assetUnitBalance(assetTokenId: string) {
  const connectedSigner = await signer();
  const { assetToken } = addresses();
  const asset = new Contract(assetToken, assetAbi, connectedSigner);
  return BigInt(await asset.getFunction('balanceOf')(await connectedSigner.getAddress(), BigInt(assetTokenId)));
}

/** Seller signs approval and escrow creation; the browser wallet is the token holder. */
export async function createOnChainListing(input: { assetTokenId: string; units: string; pricePerToken: string }) {
  const connectedSigner = await signer();
  const { assetToken, marketplace } = addresses();
  const asset = new Contract(assetToken, assetAbi, connectedSigner);
  const isApprovedForAll = asset.getFunction('isApprovedForAll');
  if (!(await isApprovedForAll(await connectedSigner.getAddress(), marketplace))) {
    await (await asset.getFunction('setApprovalForAll')(marketplace, true)).wait();
  }
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  const pricePerUnitWei = parseUnits(input.pricePerToken, 18);
  const tx = await market.getFunction('createListing')(BigInt(input.assetTokenId), BigInt(input.units), pricePerUnitWei);
  const receipt = await tx.wait();
  const iface = new Interface(marketplaceAbi);
  const event = receipt?.logs.map((log: { topics: readonly string[]; data: string }) => { try { return iface.parseLog(log); } catch { return null; } })
    .find((log: ReturnType<Interface['parseLog']> | null) => log?.name === 'Listed');
  if (!receipt || !event) throw new Error('Listing transaction confirmed but its Listed event was not found.');
  return {
    receipt,
    listingId: event.args.listingId.toString(),
    sellerAddress: event.args.seller as string,
    txHash: receipt.hash,
    pricePerTokenWei: pricePerUnitWei.toString(),
  };
}

/** Returns the connected buyer's spendable CAP balance (18 decimal CAP). */
export async function capBalance() {
  const connectedSigner = await signer();
  const { paymentToken } = addresses();
  const payment = new Contract(paymentToken, paymentAbi, connectedSigner);
  return BigInt(await payment.getFunction('balanceOf')(await connectedSigner.getAddress()));
}

/** Buyer verifies CAP, approves the V2 marketplace, then escrows CAP for seller approval. */
export async function requestPurchase(input: { listingId: string; units: string; pricePerUnitWei: string }) {
  const connectedSigner = await signer();
  const { paymentToken, marketplace } = addresses();
  const cost = BigInt(input.units) * BigInt(input.pricePerUnitWei);
  const payment = new Contract(paymentToken, paymentAbi, connectedSigner);
  const account = await connectedSigner.getAddress();
  const balance = BigInt(await payment.getFunction('balanceOf')(account));
  if (balance < cost) {
    throw new Error(`Insufficient CAP balance. This purchase requires ${formatUnits(cost, 18)} CAP.`);
  }
  if (BigInt(await payment.getFunction('allowance')(account, marketplace)) < cost) {
    await (await payment.getFunction('approve')(marketplace, cost)).wait();
  }
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  const receipt = await (await market.getFunction('requestPurchase')(BigInt(input.listingId), BigInt(input.units))).wait();
  const event = receipt?.logs.map((log: { topics: readonly string[]; data: string }) => { try { return market.interface.parseLog(log); } catch { return null; } })
    .find((log: ReturnType<Interface['parseLog']> | null) => log?.name === 'PurchaseRequested');
  if (!receipt || !event) throw new Error('CAP was escrowed but the purchase reference could not be read.');
  return {
    receipt,
    purchaseId: event.args.purchaseId.toString(),
    buyerAddress: event.args.buyer as string,
    txHash: receipt.hash,
    paymentCAP: event.args.paymentCAP.toString(),
  };
}

/** Only the listing seller can release buyer-escrowed CAP and the ERC-1155 units. */
export async function approveSettlement(purchaseId: string) {
  const connectedSigner = await signer();
  const { marketplace } = addresses();
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  return (await market.getFunction('approveSettlement')(BigInt(purchaseId))).wait();
}

export async function closeOnChainListing(listingId: string) {
  const connectedSigner = await signer();
  const { marketplace } = addresses();
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  return (await market.getFunction('closeListing')(BigInt(listingId))).wait();
}

export { formatUnits };
