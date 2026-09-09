'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserProvider, Contract } from 'ethers';
import type { DocumentType } from '@caprov/types';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  documentTypeLabel,
  documentTypeOptions,
  formatDateTime,
} from '@/lib/format';
import type { AssetDocumentsTree, DocumentRow, HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

function anchorTone(status?: string) {
  switch (status) {
    case 'BLOCKCHAIN_ANCHORED':
      return 'ok';
    case 'SIMULATED':
      return 'warn';
    case 'ANCHOR_FAILED':
      return 'danger';
    default:
      return 'muted';
  }
}

interface DocumentNetworkStatus {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  contractAddress?: string;
  walletAddress?: string;
  serverSignerReady?: boolean;
  mode: 'LIVE' | 'SIMULATED';
  liveReady: boolean;
  message: string;
}

type WalletProviderLike = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: WalletProviderLike[];
};

interface WalletSession {
  account: string;
  chainId: number;
  provider: WalletProviderLike;
  browserProvider: BrowserProvider;
}

const DOCUMENT_REGISTRY_ABI = [
  'function anchorDocumentVersion(string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)',
] as const;

const SEPOLIA_CHAIN_ID = 11155111;
const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    assetId: '',
    extractedText: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const assets = assetsQuery.data ?? [];

  useEffect(() => {
    if (!selectedAssetId && assets[0]?.id) {
      setSelectedAssetId(assets[0].id);
    }
    if (!form.assetId && assets[0]?.id) {
      setForm((current) => ({ ...current, assetId: assets[0]?.id ?? '' }));
    }
  }, [assets, selectedAssetId, form.assetId]);

  const assetTreeQuery = useQuery({
    queryKey: ['documents-tree', selectedAssetId],
    enabled: Boolean(selectedAssetId),
    queryFn: async () =>
      (await api.get<AssetDocumentsTree>(`/documents/assets/${selectedAssetId}/folders`)).data,
  });
  const networkQuery = useQuery({
    queryKey: ['documents-network-status'],
    queryFn: async () =>
      (await api.get<DocumentNetworkStatus>('/documents/network-status')).data,
  });

  const ingest = useMutation({
    mutationFn: async () =>
      (
        await api.post<DocumentRow>('/documents', {
        name: form.name,
        type: form.type,
        assetId: form.assetId,
        extractedText: form.extractedText,
      })
      ).data,
  });

  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      if (file) {
        body.append('file', file);
      }
      body.append('name', form.name || file?.name || 'Untitled document');
      body.append('type', form.type);
      body.append('assetId', form.assetId);
      if (form.extractedText.trim()) {
        body.append('extractedText', form.extractedText);
      }
      return api.post('/documents/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((response) => response.data as DocumentRow);
    },
  });
  const recordAnchor = useMutation({
    mutationFn: async (input: {
      documentId: string;
      transactionHash: string;
      walletAddress: string;
    }) =>
      (
        await api.post<DocumentRow>(`/documents/${input.documentId}/anchor`, {
          transactionHash: input.transactionHash,
          walletAddress: input.walletAddress,
        })
      ).data,
  });

  const tree = assetTreeQuery.data;
  const network = networkQuery.data;
  const canWalletAnchor = Boolean(user);
  const liveDocumentAnchoringReady = Boolean(network?.liveReady && network.contractAddress);
  const folderStats = useMemo(() => {
    const folders = tree?.folders ?? [];
    const currentDocs = folders.reduce((sum, folder) => sum + folder.documentCount, 0);
    const versions = folders.reduce((sum, folder) => sum + folder.totalVersions, 0);
    const anchored = folders.reduce(
      (sum, folder) =>
        sum +
        folder.entries.filter((entry) => entry.anchorStatus === 'BLOCKCHAIN_ANCHORED').length,
      0,
    );
    return { currentDocs, versions, anchored };
  }, [tree]);

  async function refreshDocuments(assetId: string) {
    await queryClient.invalidateQueries({ queryKey: ['documents-tree', assetId] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
    await queryClient.invalidateQueries({ queryKey: ['assets'] });
  }

  async function connectWallet(): Promise<WalletSession> {
    setWalletBusy(true);
    setAnchorError(null);
    setWalletMessage('Opening MetaMask…');
    try {
      const session = await connectMetaMask(network);
      setWalletSession(session);
      setWalletMessage(`MetaMask connected: ${shortAddress(session.account)}`);
      return session;
    } catch (error) {
      const message = readErrorMessage(error);
      setWalletMessage(null);
      setAnchorError(message);
      throw error;
    } finally {
      setWalletBusy(false);
    }
  }

  async function disconnectWallet() {
    setWalletSession(null);
    setWalletMessage('Wallet disconnected.');
  }

  async function anchorDocumentWithWallet(document: DocumentRow, session: WalletSession) {
    if (!document.assetId || !document.documentHash || !document.offChainUri) {
      throw new Error('The uploaded document is missing anchor metadata.');
    }
    if (!network?.contractAddress) {
      throw new Error('Sepolia document registry contract is not configured.');
    }

    await ensureSepoliaNetwork(session.provider, network);
    const signer = await session.browserProvider.getSigner();
    const signerAddress = await signer.getAddress();
    const contract = new Contract(network.contractAddress, DOCUMENT_REGISTRY_ABI, signer);
    const anchorFn = contract.getFunction('anchorDocumentVersion');
    setWalletMessage('Awaiting MetaMask signature…');
    const tx = await anchorFn(
      document.assetId,
      document.id,
      document.type,
      document.name,
      BigInt(document.version ?? 1),
      normalizeHash(document.documentHash),
      normalizeHash(document.previousVersionHash),
      document.offChainUri,
    );
    setWalletMessage(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    const transactionHash = receipt?.hash ?? tx.hash;
    if (!receipt || Number(receipt.status ?? 0) !== 1) {
      throw new Error(`Sepolia anchor transaction failed: ${transactionHash}`);
    }

    await recordAnchor.mutateAsync({
      documentId: document.id,
      transactionHash,
      walletAddress: signerAddress,
    });
    setWalletSession({
      ...session,
      account: signerAddress,
    });
    setWalletMessage(`Anchored on Sepolia: ${transactionHash}`);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setAnchorError(null);
    if (!form.assetId) {
      setFormError('Select the asset this document belongs to.');
      return;
    }
    if (!file && !form.extractedText.trim()) {
      setFormError('Add a file or paste text so the document has something to ingest.');
      return;
    }

    let created: DocumentRow | null = null;
    try {
      created = file ? await upload.mutateAsync() : await ingest.mutateAsync();
      if (canWalletAnchor && liveDocumentAnchoringReady && created.documentHash) {
        const session = walletSession ?? (await connectWallet());
        await anchorDocumentWithWallet(created, session);
      }
      setForm((current) => ({ ...current, name: '', type: 'OTHER', extractedText: '' }));
      setFile(null);
      setFormError('');
      await refreshDocuments(form.assetId);
    } catch (error) {
      const message = readErrorMessage(error);
      setAnchorError(message);
      if (created?.assetId) {
        await refreshDocuments(created.assetId);
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Asset document folders"
        description="Each asset keeps its own document folders. Uploads are filed by document type, and repeated filenames create a new version instead of overwriting the current one."
        actions={
          <Link href="/assets/new">
            <Button variant="secondary">Create asset</Button>
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Assets', value: String(assets.length), hint: 'Each asset has its own document workspace' },
          { label: 'Current files', value: String(folderStats.currentDocs), hint: 'Latest version in each lineage' },
          { label: 'Stored versions', value: String(folderStats.versions), hint: 'Previous versions remain accessible' },
          { label: 'Anchored current docs', value: String(folderStats.anchored), hint: 'Current versions with Sepolia anchor data' },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>

      {assets.length === 0 ? (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Create an asset before you upload documents
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            CAPROV now files documents inside each asset. Once an asset exists, uploads will be routed
            into the correct category folder and versioned by filename.
          </p>
          <div className="mt-4">
            <Link href="/assets/new">
              <Button>Create asset</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <Field label="Asset document section">
              <Select value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Folders are created automatically from the document type. Version numbering is isolated per
              asset, category, and filename.
            </p>
          </Card>

          {assetTreeQuery.isLoading ? (
            <Card className="p-6 text-sm text-[var(--muted)]">Loading folders…</Card>
          ) : null}

          {(tree?.folders ?? []).map((folder) => (
            <Card key={folder.type} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{folder.folderName}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {folder.documentCount} current document{folder.documentCount === 1 ? '' : 's'} ·{' '}
                    {folder.totalVersions} stored version{folder.totalVersions === 1 ? '' : 's'}
                  </p>
                </div>
                <Badge>{documentTypeLabel[folder.type]}</Badge>
              </div>

              {folder.entries.length ? (
                <div className="mt-4 space-y-3">
                  {folder.entries.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-[var(--line)] px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={`/documents/${entry.id}`} className="font-medium text-[var(--ink)] hover:underline">
                            {entry.name}
                          </Link>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            Current version v{entry.currentVersion} · {entry.versionCount} total version
                            {entry.versionCount === 1 ? '' : 's'}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Original filename {entry.originalFilename} · Uploaded {formatDateTime(entry.uploadedAt)}
                            {entry.uploadedBy ? ` · By ${entry.uploadedBy}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="ink">{entry.status}</Badge>
                          <Badge tone={entry.documentStatus === 'READY' ? 'ok' : 'warn'}>
                            {entry.documentStatus}
                          </Badge>
                          <Badge tone={anchorTone(entry.anchorStatus)}>
                            {entry.anchorStatus?.replaceAll('_', ' ') ?? 'Not anchored'}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                            <tr>
                              <th className="pb-2 pr-4 font-medium">Version</th>
                              <th className="pb-2 pr-4 font-medium">Uploaded</th>
                              <th className="pb-2 pr-4 font-medium">Status</th>
                              <th className="pb-2 pr-4 font-medium">Blockchain</th>
                              <th className="pb-2 font-medium">Open</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.versions.map((version) => (
                              <tr key={version.id} className="border-t border-[var(--line)]/80">
                                <td className="py-2 pr-4">v{version.version}</td>
                                <td className="py-2 pr-4">{formatDateTime(version.createdAt)}</td>
                                <td className="py-2 pr-4">
                                  <div className="flex flex-wrap gap-2">
                                    <Badge tone={version.versionStatus === 'CURRENT' ? 'ink' : 'muted'}>
                                      {version.versionStatus ?? 'PREVIOUS'}
                                    </Badge>
                                    <Badge tone={version.status === 'READY' ? 'ok' : 'warn'}>{version.status}</Badge>
                                  </div>
                                </td>
                                <td className="py-2 pr-4">
                                  <Badge tone={anchorTone(version.anchorStatus)}>
                                    {version.anchorStatus?.replaceAll('_', ' ') ?? 'Not anchored'}
                                  </Badge>
                                </td>
                                <td className="py-2">
                                  <Link href={`/documents/${version.id}`} className="text-sm underline">
                                    Open version
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--muted)]">No documents in this folder yet.</p>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="rounded-2xl border border-[var(--line)] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">Wallet-signed Sepolia document anchoring</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  When live anchoring is configured, document upload will prompt the uploader to connect MetaMask
                  and sign the Sepolia anchor transaction.
                </p>
              </div>
              <Badge tone={liveDocumentAnchoringReady ? 'ok' : 'warn'}>
                {network?.chainName ?? 'Sepolia'} {liveDocumentAnchoringReady ? 'live ready' : 'not configured'}
              </Badge>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {network?.message ?? 'Loading Sepolia network status…'}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {walletSession
                ? `Connected MetaMask wallet ${shortAddress(walletSession.account)} on chain ${walletSession.chainId}.`
                : 'No wallet connected yet.'}
            </p>
            {walletMessage ? <p className="mt-2 text-xs text-[var(--muted)]">{walletMessage}</p> : null}
            {anchorError ? <p className="mt-2 text-xs text-rose-600">{anchorError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void connectWallet()}
                disabled={walletBusy || !canWalletAnchor || !liveDocumentAnchoringReady}
              >
                Connect MetaMask
              </Button>
              {walletSession ? (
                <Button type="button" onClick={() => void disconnectWallet()} disabled={walletBusy}>
                  Disconnect
                </Button>
              ) : null}
            </div>
            {!canWalletAnchor ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Sign in to connect a wallet and anchor documents on Sepolia.
              </p>
            ) : null}
            {canWalletAnchor && !liveDocumentAnchoringReady ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Genuine Sepolia document anchors are disabled until the API is configured with a live document
                registry contract. Uploads will be stored, but no real blockchain transaction will be requested.
              </p>
            ) : null}
          </div>
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Upload a document</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Field label="Asset">
              <Select
                value={form.assetId}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((current) => ({ ...current, assetId: value }));
                  setSelectedAssetId(value);
                }}
                required
              >
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="File">
              <Input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected && !form.name) {
                    setForm((current) => ({ ...current, name: selected.name }));
                  }
                }}
              />
            </Field>
            <Field label="Document name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Category">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DocumentType })}>
                {documentTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Text fallback">
              <Textarea
                rows={8}
                value={form.extractedText}
                onChange={(e) => setForm({ ...form, extractedText: e.target.value })}
                placeholder="Optional: paste text directly, or leave blank when uploading PDF / DOCX."
              />
            </Field>
            {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}
            <Button
              type="submit"
              disabled={ingest.isPending || upload.isPending || recordAnchor.isPending || walletBusy}
            >
              {ingest.isPending || upload.isPending || recordAnchor.isPending || walletBusy
                ? 'Processing…'
                : file
                  ? canWalletAnchor && liveDocumentAnchoringReady
                    ? 'Upload, sign, and anchor on Sepolia'
                    : 'Upload new version'
                  : canWalletAnchor && liveDocumentAnchoringReady
                    ? 'Ingest, sign, and anchor on Sepolia'
                    : 'Ingest new version'}
            </Button>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Uploading the same filename into the same asset folder and category creates a new version and keeps
              all previous versions available in history. When live Sepolia anchoring is configured, the uploader
              will be prompted to sign the anchor transaction with MetaMask.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalizeHash(value?: string) {
  if (!value) {
    return `0x${'0'.repeat(64)}`;
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

function readErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
      ? error.code
      : undefined;
  if (code === 4001) {
    return 'MetaMask request was cancelled.';
  }
  if (code === -32002) {
    return 'MetaMask already has a pending request open. Open the extension and finish that request first.';
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data
  ) {
    const message = error.response.data.message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

async function connectMetaMask(network?: DocumentNetworkStatus): Promise<WalletSession> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error('MetaMask is not available in this browser. Install or unlock MetaMask and try again.');
  }
  await provider.request({ method: 'eth_requestAccounts' });
  await ensureSepoliaNetwork(provider, network);
  const browserProvider = new BrowserProvider(provider, network?.chainId ?? SEPOLIA_CHAIN_ID);
  const signer = await browserProvider.getSigner();
  const account = await signer.getAddress();
  const chain = await browserProvider.getNetwork();
  return {
    account,
    chainId: Number(chain.chainId),
    provider,
    browserProvider,
  };
}

async function ensureSepoliaNetwork(
  provider: WalletProviderLike,
  network?: DocumentNetworkStatus,
) {
  const chainId = network?.chainId ?? SEPOLIA_CHAIN_ID;
  const targetHex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'number'
        ? error.code
        : undefined;
    if (code !== 4902) {
      throw error;
    }
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: targetHex,
          chainName: network?.chainName ?? 'Ethereum Sepolia',
          rpcUrls: [network?.rpcUrl ?? DEFAULT_SEPOLIA_RPC],
          nativeCurrency: {
            name: 'Sepolia ETH',
            symbol: 'SEP',
            decimals: 18,
          },
          blockExplorerUrls: [network?.explorerBase ?? 'https://sepolia.etherscan.io'],
        },
      ],
    });
  }
}

function getMetaMaskProvider(): WalletProviderLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const ethereum = (window as typeof window & { ethereum?: WalletProviderLike }).ethereum;
  if (!ethereum) {
    return undefined;
  }
  if (ethereum.providers?.length) {
    return ethereum.providers.find((provider) => provider.isMetaMask) ?? ethereum.providers[0];
  }
  return ethereum;
}
