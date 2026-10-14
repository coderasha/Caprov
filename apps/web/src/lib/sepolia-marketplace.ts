import { BrowserProvider, Contract, FeeData, Interface, id as ethId, type Eip1193Provider, formatUnits, parseUnits } from 'ethers';
import type { MetamaskConnectEVM } from '@metamask/connect-evm';
import { blockchainNetworks, selectedBlockchainNetwork, type BrowserNetwork } from './blockchain-network';

const assetAbi = [
  'function mintAsset(address to, uint256 id, uint256 amount, string assetReference)',
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
const collateralVaultAbi = [
  'function lockCollateral(address assetToken,uint256 tokenId,uint256 units) returns (uint256)',
  'function activateLoan(uint256 collateralId,bytes32 loanReference)',
  'function releaseAfterRepayment(uint256 collateralId)',
  'function setLoanActivator(address account,bool allowed)',
  'function loanActivators(address account) view returns (bool)',
  'event CollateralLocked(uint256 indexed collateralId,address indexed borrower,address indexed assetToken,uint256 tokenId,uint256 units)',
  'event CollateralReleased(uint256 indexed collateralId,address indexed borrower)',
] as const;

type WalletWindow = Window & { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } };

export interface WalletOption {
  id: string;
  name: string;
  rdns?: string;
}

export type WalletProvider = Eip1193Provider & {
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
let metaMaskConnectClient: Promise<MetamaskConnectEVM> | undefined;
// MetaMask permits only one account-connection prompt for an origin at a time.
// Keep the promise at module scope because the global wallet menu, a page action,
// and a stale component can otherwise all issue the same request in one render.
let accountConnectionRequest: Promise<string[]> | undefined;

/** Drops a provider that MetaMask has disconnected or restarted in the background. */
export function clearMetaMaskConnection() {
  activeWallet = undefined;
  activeAccount = undefined;
}

/** Records the account MetaMask has made active through its own account menu. */
export function syncActiveMetaMaskAccount(accounts: string[]) {
  activeAccount = accounts[0];
}

function walletErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: number | string }).code;
  }
  return undefined;
}

function accountConnectionError(error: unknown) {
  if (walletErrorCode(error) === -32002) {
    return new Error(
      'MetaMask already has a connection request open for CAPROV. Open the MetaMask extension, complete or reject that request, then return here and press Select account. Do not open another connection prompt.',
    );
  }
  return error;
}

/**
 * Opens at most one MetaMask account permission request for this page origin.
 * It is used only for the initial connection. Account switching is handled
 * by CAPROV's picker from accounts MetaMask has already authorized.
 */
async function requestMetaMaskAccounts(provider: WalletProvider) {
  if (!accountConnectionRequest) {
    accountConnectionRequest = provider
      .request({ method: 'eth_requestAccounts' })
      .then((value) => (Array.isArray(value) ? value as string[] : []))
      .catch((error: unknown) => {
        throw accountConnectionError(error);
      })
      .finally(() => {
        accountConnectionRequest = undefined;
      });
  }
  return accountConnectionRequest;
}

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
  // When account selection was just completed through MetaMask Connect, retain
  // that provider for verification. Falling back to the injected provider here
  // creates a second permissions request while the first is still settling.
  const metaMask = activeWallet ?? await metaMaskWallet();
  activeWallet = metaMask;
  // Never reopen the permission dialog for an origin that MetaMask has already
  // authorized. MetaMask implements `eth_requestAccounts` as a permissions
  // request, so calling it again is what produced the pending-permissions
  // error reported from inpage.js.
  const exposedAccounts = (await metaMask.provider.request({ method: 'eth_accounts' })) as string[];
  const accounts = exposedAccounts.length
    ? exposedAccounts
    : await requestMetaMaskAccounts(metaMask.provider);
  if (!accounts[0]) throw new Error('MetaMask did not expose an account to CAPROV.');
  activeAccount = activeAccount && accounts.some((account) => account.toLowerCase() === activeAccount?.toLowerCase())
    ? activeAccount
    : accounts[0];
  // Move MetaMask onto the CAPROV-selected chain before signer work.
  await switchWalletToSelectedNetwork();
  const provider = walletBrowserProvider(metaMask.provider);
  const network = await provider.getNetwork();
  const selected = selectedBlockchainNetwork();
  if (network.chainId !== BigInt(selected.chainId)) {
    throw new Error(
      `MetaMask did not switch to ${selected.chainName} (chain ID ${selected.chainId}).`,
    );
  }
  const address = await (await provider.getSigner(activeAccount)).getAddress();
  return { address, accounts };
}

/** Returns accounts that MetaMask has already authorized for CAPROV. */
export async function chooseMetaMaskAccount() {
  const provider = await selectedProvider();
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (!accounts[0]) throw new Error('MetaMask did not expose an account to CAPROV.');
  activeAccount = activeAccount && accounts.some((account) => account.toLowerCase() === activeAccount?.toLowerCase())
    ? activeAccount
    : accounts[0];
  return { address: activeAccount, accounts };
}

/**
 * Reopens MetaMask's account-permission flow so a user can add or remove the
 * accounts this origin may see. MetaMask owns the dialog; CAPROV only requests
 * it and then reads the accounts the user approved.
 */
export async function requestMetaMaskAccountSelection() {
  const provider = await selectedProvider();
  try {
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    throw accountConnectionError(error);
  }
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
  if (!accounts[0]) throw new Error('No MetaMask account was approved for CAPROV.');
  activeAccount = accounts[0];
  return { address: accounts[0], accounts };
}

/**
 * Opens MetaMask Connect's supported account selector for an existing session.
 * Unlike calling wallet_requestPermissions directly on the injected provider,
 * forceRequest is handled by MetaMask Connect and consistently presents the
 * account chooser rather than leaving the extension in a pending state.
 */
export async function promptMetaMaskAccountSelection() {
  if (typeof window === 'undefined') throw new Error('MetaMask account selection is available only in a browser.');
  if (!metaMaskConnectClient) {
    const supportedNetworks = Object.fromEntries(
      blockchainNetworks().map((network) => [`0x${network.chainId.toString(16)}`, network.rpcUrl]),
    ) as Record<`0x${string}`, string>;
    metaMaskConnectClient = import('@metamask/connect-evm')
      .then(({ createEVMClient }) => createEVMClient({
        dapp: { name: 'CAPROV', url: window.location.origin },
        api: { supportedNetworks },
        ui: { preferExtension: true, showInstallModal: false },
        // CAPROV already performs EIP-6963 discovery for its transaction provider.
        // Do not announce a second provider when this helper is used only as a picker.
        skipAutoAnnounce: true,
      }))
      .catch((error) => {
        metaMaskConnectClient = undefined;
        throw error;
      });
  }
  const client = await metaMaskConnectClient;
  const selected = selectedBlockchainNetwork();
  const result = await client.connect({
    chainIds: [`0x${selected.chainId.toString(16)}`],
    forceRequest: true,
  });
  const accounts = [...result.accounts];
  if (!accounts[0]) throw new Error('No MetaMask account was selected for CAPROV.');
  activeWallet = { id: 'metamask-connect', provider: client.getProvider() as unknown as WalletProvider };
  activeAccount = accounts[0];
  return { address: accounts[0], accounts };
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
  const network = selectedBlockchainNetwork();
  const assetToken = network.assetToken;
  const paymentToken = network.paymentToken;
  const marketplace = network.marketplace;
  if (!assetToken || !paymentToken || !marketplace) {
    throw new Error(`${network.chainName} marketplace contracts are not configured for this web app.`);
  }
  return { assetToken, paymentToken, marketplace };
}

function assetTokenAddress() {
  const network = selectedBlockchainNetwork();
  const assetToken = network.assetToken;
  if (!assetToken) throw new Error(`The ${network.chainName} ERC-1155 asset-token contract is not configured for this web app.`);
  return assetToken;
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

/**
 * Makes the wallet follow the CAPROV network selected in the application.
 * Both Sepolia and Besu are EVM networks, so their contract workflows use the
 * same signer once the wallet has moved to the selected chain.
 */
export async function switchWalletToSelectedNetwork() {
  const provider = await selectedProvider();
  await ensureProviderChain(provider, selectedBlockchainNetwork());
}

/**
 * Aligns MetaMask to `network` for both Ethereum Sepolia and CAPROV Besu.
 * Tries `wallet_switchEthereumChain` first; when the chain is missing (common
 * for Besu), adds it with `wallet_addEthereumChain`, then verifies.
 */
export async function ensureProviderChain(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  network: BrowserNetwork,
) {
  let current = await readChainId(provider);
  if (sameChainId(current, network.chainId)) return;

  const chainIdHex = toChainIdHex(network.chainId);
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = providerErrorCode(error);
    if (code === 4001) {
      throw new Error(`Switch to ${network.chainName} was cancelled in MetaMask.`);
    }
    if (code === -32002) {
      throw new Error(
        'A MetaMask request is already open. Finish or close that prompt, then try again.',
      );
    }
    // Ethereum Sepolia is a built-in MetaMask test network. Trying to add it
    // again after an internal switch failure can make some MetaMask builds
    // throw "Cannot read properties of undefined (reading 'origin')" from
    // the extension UI. It must be enabled in MetaMask instead of added by
    // the dapp, so return a useful recovery instruction without a second RPC.
    if (network.id === 'sepolia') {
      throw new Error(networkSelectionMessage(network));
    }
    // MetaMask's current extension can crash in its own add-network dialog for
    // loopback custom RPCs ("reading 'origin'"). Do not invoke that unstable
    // dialog for the local Besu network. Once the user has added it once in
    // MetaMask, wallet_switchEthereumChain remains the normal, safe path.
    if (network.id === 'besu') {
      throw new Error(besuNetworkSetupMessage(network));
    }
    if (code === 4902 || code === -32603 || isUnrecognizedChainError(error)) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [addEthereumChainParams(network)],
        });
      } catch (addError) {
        const addCode = providerErrorCode(addError);
        if (addCode === 4001) {
          throw new Error(`Adding ${network.chainName} in MetaMask was cancelled.`);
        }
        if (addCode === -32002) {
          throw new Error(
            'A MetaMask request is already open. Finish or close that prompt, then try again.',
          );
        }
        // Chain may already exist under another name; retry the switch once.
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch {
          throw new Error(networkSelectionMessage(network));
        }
      }
    } else {
      throw new Error(networkSelectionMessage(network));
    }
  }

  current = await readChainId(provider);
  if (!sameChainId(current, network.chainId)) {
    // Some MetaMask builds approve add without completing the switch.
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch {
      /* verified below */
    }
    current = await readChainId(provider);
  }
  if (!sameChainId(current, network.chainId)) {
    throw new Error(networkSelectionMessage(network));
  }
}

/** Legacy fees for zero-base-fee Besu. EIP-1559 fee data of 0 crashes MetaMask's confirmation. */
export function walletBrowserProvider(provider: Eip1193Provider, chainId?: number) {
  const selected = selectedBlockchainNetwork();
  const browserProvider = new BrowserProvider(provider, chainId ?? selected.chainId);
  if (selected.zeroGas) {
    browserProvider.getFeeData = async () => new FeeData(1n, null, null);
  }
  return browserProvider;
}

/** Switch MetaMask to the CAPROV-selected chain without reopening the connect prompt. */
export async function alignMetaMaskToSelectedNetwork() {
  await alignMetaMaskToNetwork(selectedBlockchainNetwork());
}

/** Switch to an explicit target without changing CAPROV's selected-network state first. */
export async function alignMetaMaskToNetwork(network: BrowserNetwork) {
  const provider = await selectedProvider();
  await ensureProviderChain(provider, network);
}

function sameChainId(current: unknown, chainId: number) {
  if (typeof current === 'string') {
    return Number.parseInt(current, 16) === chainId;
  }
  if (typeof current === 'number') return current === chainId;
  return false;
}

function toChainIdHex(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

async function readChainId(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
) {
  try {
    return await provider.request({ method: 'eth_chainId' });
  } catch {
    return undefined;
  }
}

function providerErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: number | string }).code;
  }
  return undefined;
}

function isUnrecognizedChainError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');
  return /unrecognized chain|unknown chain|chain.*not.*added|does not exist/i.test(message);
}

function metamaskRpcUrl(rpcUrl: string) {
  const url = new URL(rpcUrl);
  // MetaMask's built-in local network is http://localhost:8545. Sending
  // 127.0.0.1 creates a second endpoint whose origin the confirmation cannot read.
  if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
  return url.toString().replace(/\/$/, '');
}

function addEthereumChainParams(network: BrowserNetwork) {
  const rpcUrl = metamaskRpcUrl(network.rpcUrl);
  const params: {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls?: string[];
  } = {
    chainId: toChainIdHex(network.chainId),
    chainName: network.chainName,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpcUrl],
  };
  // MetaMask can use an HTTP loopback RPC endpoint, but recent extension
  // builds can crash internally while resolving an HTTP/loopback explorer's
  // origin during wallet_addEthereumChain. A local explorer is not required
  // for signing, so omit it; retain only public HTTPS explorers.
  const explorerUrl = metaMaskExplorerUrl(network.blockExplorerUrl);
  if (explorerUrl) {
    params.blockExplorerUrls = [explorerUrl];
  }
  return params;
}

function metaMaskExplorerUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    return url.protocol === 'https:' && !isLoopback ? value : undefined;
  } catch {
    return undefined;
  }
}

function networkSelectionMessage(network: BrowserNetwork) {
  if (network.id === 'sepolia') {
    return 'Could not switch MetaMask to Ethereum Sepolia. Open MetaMask, enable “Show test networks”, select Ethereum Sepolia, then retry. CAPROV will detect the change automatically.';
  }
  return besuNetworkSetupMessage(network);
}

function besuNetworkSetupMessage(network: BrowserNetwork) {
  const rpcUrl = metamaskRpcUrl(network.rpcUrl);
  return [
    `CAPROV Besu Local must be added once in MetaMask before it can be selected.`,
    `In MetaMask: Settings → Networks → Add network manually. Name: ${network.chainName}; RPC URL: ${rpcUrl}; Chain ID: ${network.chainId}; currency symbol: ETH.`,
    'Save it, select it in MetaMask, then return to CAPROV and choose CAPROV Besu Local again.',
  ].join(' ');
}

/** The exact MetaMask provider selected by CAPROV's global wallet menu. */
export async function activeMetaMaskProvider(): Promise<WalletProvider> {
  return selectedProvider();
}

/** Returns the provider and account selected from CAPROV's global wallet menu. */
export async function activeMetaMaskConnection() {
  const provider = await selectedProvider();
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  const address = activeAccount && accounts.find((item) => item.toLowerCase() === activeAccount?.toLowerCase())
    ? activeAccount
    : accounts[0];
  return { provider, accounts, address };
}

async function signer(walletId?: string) {
  const rawProvider = await selectedProvider(walletId);
  await ensureProviderChain(rawProvider, selectedBlockchainNetwork());
  const existingAccounts = await rawProvider.request({ method: 'eth_accounts' }) as string[];
  const requestedAccounts = existingAccounts.length
    ? existingAccounts
    : await requestMetaMaskAccounts(rawProvider);
  const provider = walletBrowserProvider(rawProvider);
  const network = await provider.getNetwork();
  const selected = selectedBlockchainNetwork();
  if (network.chainId !== BigInt(selected.chainId)) {
    throw new Error(`Switch your wallet to ${selected.chainName} (chain ID ${selected.chainId}).`);
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

/** Lister signs a real Sepolia ERC-1155 transfer into the configured collateral vault. */
export async function lockCollateralOnSepolia(input: { tokenId: string; units: string }) {
  const vault = selectedBlockchainNetwork().collateralVault;
  if (!vault) throw new Error(`CollateralVault is not configured for ${selectedBlockchainNetwork().chainName}.`);
  const connectedSigner = await signer(); const { assetToken } = addresses();
  const asset = new Contract(assetToken, assetAbi, connectedSigner);
  if (!(await asset.getFunction('isApprovedForAll')(await connectedSigner.getAddress(), vault))) await (await asset.getFunction('setApprovalForAll')(vault, true)).wait();
  const contract = new Contract(vault, collateralVaultAbi, connectedSigner);
  const receipt = await (await contract.getFunction('lockCollateral')(assetToken, BigInt(input.tokenId), BigInt(input.units))).wait();
  if (!receipt) throw new Error('Collateral lock did not confirm.');
  const event = receipt.logs.map((log: { topics: readonly string[]; data: string }) => { try { return contract.interface.parseLog(log); } catch { return null; } }).find((log: ReturnType<Interface['parseLog']> | null) => log?.name === 'CollateralLocked');
  if (!event) throw new Error('Collateral lock confirmed but event was not found.');
  return { collateralId: event.args.collateralId.toString(), txHash: receipt.hash };
}

/** A whitelisted bank wallet records the accepted facility on Sepolia before USD is credited. */
export async function activateCollateralLoanOnSepolia(input: { collateralId: string; loanId: string }) {
  const vault = selectedBlockchainNetwork().collateralVault;
  if (!vault) throw new Error(`CollateralVault is not configured for ${selectedBlockchainNetwork().chainName}.`);
  const connectedSigner = await signer();
  const contract = new Contract(vault, collateralVaultAbi, connectedSigner);
  const receipt = await (await contract.getFunction('activateLoan')(
    BigInt(input.collateralId), ethId(`caprov:loan:${input.loanId}`),
  )).wait();
  if (!receipt) throw new Error('Collateral-loan activation did not confirm.');
  return { txHash: receipt.hash };
}

/** The bank custody wallet returns a fully repaid ERC-1155 collateral position. */
export async function releaseCollateralAfterRepaymentOnSepolia(input: { collateralId: string }) {
  const vault = selectedBlockchainNetwork().collateralVault;
  if (!vault) throw new Error(`CollateralVault is not configured for ${selectedBlockchainNetwork().chainName}.`);
  const connectedSigner = await signer();
  const contract = new Contract(vault, collateralVaultAbi, connectedSigner);
  const receipt = await (await contract.getFunction('releaseAfterRepayment')(
    BigInt(input.collateralId),
  )).wait();
  if (!receipt) throw new Error('Collateral release did not confirm.');
  return { txHash: receipt.hash };
}

/** Mints immutable ERC-1155 supply from the account chosen in MetaMask. */
export async function mintAssetFromWallet(input: { assetId: string; supply: number; recipientAddress: string }) {
  if (!Number.isSafeInteger(input.supply) || input.supply < 1) throw new Error('Token supply must be a positive whole number.');
  const connectedSigner = await signer();
  const selectedAddress = await connectedSigner.getAddress();
  if (selectedAddress.toLowerCase() !== input.recipientAddress.toLowerCase()) {
    throw new Error('The mint recipient must be the MetaMask account selected for this transaction.');
  }
  const assetToken = assetTokenAddress();
  const asset = new Contract(assetToken, assetAbi, connectedSigner);
  const tokenId = BigInt(ethId(`caprov:asset:${input.assetId}`));
  const receipt = await (await asset.getFunction('mintAsset')(selectedAddress, tokenId, BigInt(input.supply), input.assetId)).wait();
  if (!receipt) throw new Error('MetaMask submitted the mint but no confirmed receipt was returned.');
  return { txHash: receipt.hash, tokenId: tokenId.toString() };
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
