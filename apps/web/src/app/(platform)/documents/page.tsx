'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserProvider, Contract } from 'ethers';
import type { DocumentType } from '@caprov/types';
import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
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
  const { address: connectedWallet } = useWallet();
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
  const [search, setSearch] = useState('');
  const [showEmptyFolders, setShowEmptyFolders] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const assets = assetsQuery.data ?? [];
  const defaultAssetId = assets[0]?.id ?? '';
  const activeAssetId = selectedAssetId || defaultAssetId;
  const formAssetId = form.assetId || defaultAssetId;

  const assetTreeQuery = useQuery({
    queryKey: ['documents-tree', activeAssetId],
    enabled: Boolean(activeAssetId),
    queryFn: async () =>
      (await api.get<AssetDocumentsTree>(`/documents/assets/${activeAssetId}/folders`)).data,
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
        assetId: formAssetId,
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
      body.append('assetId', formAssetId);
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
  const visibleFolders = useMemo(() => {
    const folders = tree?.folders ?? [];
    const term = search.trim().toLowerCase();
    return folders
      .filter((folder) => showEmptyFolders || folder.entries.length > 0)
      .map((folder) => ({
        ...folder,
        entries: term
          ? folder.entries.filter((entry) =>
              [entry.name, entry.originalFilename, folder.folderName]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(term)),
            )
          : folder.entries,
      }))
      .filter((folder) => (term ? folder.entries.length > 0 : showEmptyFolders || folder.entries.length > 0));
  }, [tree, search, showEmptyFolders]);

  function selectAsset(assetId: string) {
    setSelectedAssetId(assetId);
    setForm((current) => ({ ...current, assetId }));
    setExpandedIds({});
  }

  async function refreshDocuments(assetId: string) {
    await queryClient.invalidateQueries({ queryKey: ['documents-tree', assetId] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
    await queryClient.invalidateQueries({ queryKey: ['assets'] });
  }

  async function connectWallet(): Promise<WalletSession> {
    setWalletBusy(true);
    setAnchorError(null);
    setWalletMessage('Using the wallet connected from the top-right menu…');
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
    if (!formAssetId) {
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
      await refreshDocuments(formAssetId);
    } catch (error) {
      const message = readErrorMessage(error);
      setAnchorError(message);
      if (created?.assetId) {
        await refreshDocuments(created.assetId);
      }
    }
  }

  const selectedAsset = assets.find((asset) => asset.id === activeAssetId);
  const emptyFolderCount = (tree?.folders ?? []).filter((folder) => folder.entries.length === 0).length;
  const submitBusy = ingest.isPending || upload.isPending || recordAnchor.isPending || walletBusy;
  const willAnchor = canWalletAnchor && liveDocumentAnchoringReady;

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
          { label: 'Anchored', value: String(folderStats.anchored), hint: 'Current versions with Sepolia anchor data' },
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
        <Card className="p-8">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Create an asset before you upload documents
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Documents are filed inside each asset. Once an asset exists, uploads go into the matching category
            folder and are versioned by filename.
          </p>
          <div className="mt-5">
            <Link href="/assets/new">
              <Button>Create asset</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 space-y-4">
            <Card className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
                <Field label="Asset">
                  <Select value={activeAssetId} onChange={(event) => selectAsset(event.target.value)}>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Input
                  placeholder="Search files"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {selectedAsset
                  ? `Showing folders for ${selectedAsset.name}. Empty categories stay hidden unless you reveal them.`
                  : 'Select an asset to browse its folders.'}
              </p>
            </Card>

            {assetTreeQuery.isLoading ? (
              <div className="space-y-4">
                {[0, 1].map((key) => (
                  <Card key={key} className="h-36 animate-pulse bg-[var(--paper-2)]/50" />
                ))}
              </div>
            ) : visibleFolders.length ? (
              visibleFolders.map((folder) => (
                <Card key={folder.type} className="overflow-hidden p-5 sm:p-6">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                        {folder.folderName}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {folder.documentCount} current · {folder.totalVersions} version
                        {folder.totalVersions === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  {folder.entries.length ? (
                    <div className="mt-4 divide-y divide-[var(--line)]/80 border-t border-[var(--line)]/80">
                      {folder.entries.map((entry) => {
                        const expanded = Boolean(expandedIds[entry.id]);
                        return (
                          <div key={entry.id} className="py-4 first:pt-4">
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <Link
                                  href={`/documents/${entry.id}`}
                                  className="break-anywhere font-medium text-[var(--ink)] hover:underline"
                                >
                                  {entry.name}
                                </Link>
                                <p className="mt-1 text-sm text-[var(--muted)]">
                                  v{entry.currentVersion}
                                  {entry.versionCount > 1 ? ` · ${entry.versionCount} versions` : ''}
                                  {entry.uploadedBy ? ` · ${entry.uploadedBy}` : ''} ·{' '}
                                  {formatDateTime(entry.uploadedAt)}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Badge tone={entry.documentStatus === 'READY' ? 'ok' : 'warn'}>
                                  {prettyStatus(entry.documentStatus)}
                                </Badge>
                                <Badge tone={anchorTone(entry.anchorStatus)}>
                                  {prettyAnchor(entry.anchorStatus)}
                                </Badge>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                              <Link
                                href={`/documents/${entry.id}`}
                                className="font-medium text-[var(--ink)] underline-offset-4 hover:underline"
                              >
                                Open document
                              </Link>
                              {entry.versionCount > 1 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedIds((current) => ({ ...current, [entry.id]: !current[entry.id] }))
                                  }
                                  className="text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
                                >
                                  {expanded ? 'Hide versions' : `Show ${entry.versionCount} versions`}
                                </button>
                              ) : null}
                            </div>
                            {expanded ? (
                              <ul className="mt-3 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3">
                                {entry.versions.map((version) => (
                                  <li
                                    key={version.id}
                                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
                                  >
                                    <p className="min-w-0 text-[var(--muted)]">
                                      <span className="font-medium text-[var(--ink)]">v{version.version}</span>
                                      {' · '}
                                      {formatDateTime(version.createdAt)}
                                      {' · '}
                                      {prettyAnchor(version.anchorStatus)}
                                    </p>
                                    <Link
                                      href={`/documents/${version.id}`}
                                      className="shrink-0 text-[var(--ink)] underline-offset-4 hover:underline"
                                    >
                                      Open
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--muted)]">No documents in this folder yet.</p>
                  )}
                </Card>
              ))
            ) : (
              <Card className="p-8 text-center">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  {search.trim() ? 'No files match this search' : 'No documents in this asset yet'}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                  {search.trim()
                    ? 'Try another filename, or clear the search to see every folder with files.'
                    : 'Upload a file using the form alongside. It will be filed by category automatically.'}
                </p>
                {search.trim() ? (
                  <Button variant="secondary" className="mt-5" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                ) : emptyFolderCount ? (
                  <Button variant="secondary" className="mt-5" onClick={() => setShowEmptyFolders(true)}>
                    Show empty folders
                  </Button>
                ) : null}
              </Card>
            )}

            {emptyFolderCount && folderStats.currentDocs ? (
              <button
                type="button"
                onClick={() => setShowEmptyFolders((current) => !current)}
                className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--ink)]"
              >
                {showEmptyFolders
                  ? 'Hide empty folders'
                  : `Show ${emptyFolderCount} empty folder${emptyFolderCount === 1 ? '' : 's'}`}
              </button>
            ) : null}
          </section>

          <div className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:h-fit">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--ink)]">Sepolia anchoring</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    {connectedWallet
                      ? `Using top-right wallet ${shortAddress(connectedWallet)}`
                      : liveDocumentAnchoringReady
                        ? 'Connect MetaMask from the top-right menu to sign anchors on upload.'
                        : network?.message ?? 'Loading network status…'}
                  </p>
                </div>
                <Badge tone={liveDocumentAnchoringReady ? 'ok' : 'warn'} className="shrink-0">
                  {liveDocumentAnchoringReady ? 'Live' : 'Off'}
                </Badge>
              </div>
              {walletMessage ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{walletMessage}</p> : null}
              {anchorError ? <p className="mt-3 text-xs leading-5 text-[var(--danger)]">{anchorError}</p> : null}
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Upload a document
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Same filename in the same category becomes a new version.
              </p>
              <form
                className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <Field label="Asset">
                  <Select value={formAssetId} onChange={(event) => selectAsset(event.target.value)} required>
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
                    onChange={(event) => {
                      const selected = event.target.files?.[0] ?? null;
                      setFile(selected);
                      if (selected && !form.name) {
                        setForm((current) => ({ ...current, name: selected.name }));
                      }
                    }}
                  />
                </Field>
                {file ? (
                  <p className="truncate rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--muted)]">
                    {file.name}
                  </p>
                ) : null}
                <Field label="Document name">
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Category">
                  <Select
                    value={form.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value as DocumentType })}
                  >
                    {documentTypeOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Text fallback">
                  <Textarea
                    rows={4}
                    value={form.extractedText}
                    onChange={(event) => setForm({ ...form, extractedText: event.target.value })}
                    placeholder="Optional if you are uploading a file."
                  />
                </Field>
                {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}
                <Button type="submit" disabled={submitBusy}>
                  {submitBusy ? 'Processing…' : willAnchor ? 'Upload and anchor' : 'Upload document'}
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function prettyStatus(value?: string) {
  if (!value) return 'Pending';
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettyAnchor(value?: string) {
  switch (value) {
    case 'BLOCKCHAIN_ANCHORED':
      return 'Anchored';
    case 'SIMULATED':
      return 'Simulated';
    case 'ANCHOR_FAILED':
      return 'Failed';
    default:
      return 'Not anchored';
  }
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
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (!accounts[0]) throw new Error('Connect MetaMask from the top-right menu before signing an anchor.');
  await ensureSepoliaNetwork(provider, network);
  const browserProvider = new BrowserProvider(provider, network?.chainId ?? SEPOLIA_CHAIN_ID);
  const account = accounts[0];
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
