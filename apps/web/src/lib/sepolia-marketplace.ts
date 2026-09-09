import { BrowserProvider, Contract, type Eip1193Provider, formatUnits } from 'ethers';

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
  'function buy(uint256 listingId, uint256 amount)',
] as const;

type WalletWindow = Window & { ethereum?: Eip1193Provider };

function addresses() {
  const assetToken = process.env.NEXT_PUBLIC_ETHEREUM_ASSET_TOKEN_CONTRACT;
  const paymentToken = process.env.NEXT_PUBLIC_ETHEREUM_PAYMENT_TOKEN_CONTRACT;
  const marketplace = process.env.NEXT_PUBLIC_ETHEREUM_MARKETPLACE_CONTRACT;
  if (!assetToken || !paymentToken || !marketplace) {
    throw new Error('Sepolia marketplace contracts are not configured for this web app.');
  }
  return { assetToken, paymentToken, marketplace };
}

async function signer() {
  const ethereum = (window as WalletWindow).ethereum;
  if (!ethereum) throw new Error('Install MetaMask or another EIP-1193 wallet.');
  const provider = new BrowserProvider(ethereum);
  await provider.send('eth_requestAccounts', []);
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error('Switch your wallet to Ethereum Sepolia (chain ID 11155111).');
  }
  return provider.getSigner();
}

export async function connectSepoliaWallet() {
  const connectedSigner = await signer();
  return connectedSigner.getAddress();
}

/** Seller signs approval and escrow creation; the browser wallet is the token holder. */
export async function createOnChainListing(input: { assetTokenId: string; units: string; pricePerUnitWei: string }) {
  const connectedSigner = await signer();
  const { assetToken, marketplace } = addresses();
  const asset = new Contract(assetToken, assetAbi, connectedSigner);
  const isApprovedForAll = asset.getFunction('isApprovedForAll');
  if (!(await isApprovedForAll(await connectedSigner.getAddress(), marketplace))) {
    await (await asset.getFunction('setApprovalForAll')(marketplace, true)).wait();
  }
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  const tx = await market.getFunction('createListing')(BigInt(input.assetTokenId), BigInt(input.units), BigInt(input.pricePerUnitWei));
  return tx.wait();
}

/** Buyer approves CAPROV then signs an atomic buy transaction. */
export async function buyOnChainListing(input: { listingId: string; units: string; pricePerUnitWei: string }) {
  const connectedSigner = await signer();
  const { paymentToken, marketplace } = addresses();
  const cost = BigInt(input.units) * BigInt(input.pricePerUnitWei);
  const payment = new Contract(paymentToken, paymentAbi, connectedSigner);
  const account = await connectedSigner.getAddress();
  if (BigInt(await payment.getFunction('allowance')(account, marketplace)) < cost) {
    await (await payment.getFunction('approve')(marketplace, cost)).wait();
  }
  const market = new Contract(marketplace, marketplaceAbi, connectedSigner);
  return (await market.getFunction('buy')(BigInt(input.listingId), BigInt(input.units))).wait();
}

export { formatUnits };
