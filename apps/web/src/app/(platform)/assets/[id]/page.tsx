'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBar } from '@/components/ui/confidence';
import { FactSummaryTable } from '@/components/intelligence/fact-summary-table';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  assetClassLabel,
  assetStatusLabel,
  confidenceLabel,
  documentTypeLabel,
  documentTypeOptions,
  formatDate,
  formatDateTime,
  money,
  riskTone,
} from '@/lib/format';
import type { AssetDocumentsTree, DocumentRow, HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import type { DocumentType, OwnershipType } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserProvider, Contract } from 'ethers';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

const tabs = ['Overview', 'DNA', 'Documents', 'Ownership', 'Valuation & risk'] as const;

function folderNameForType(type: DocumentType) {
  switch (type) {
    case 'TITLE_DEED':
      return 'Title Deed';
    case 'SPA':
      return 'SPA';
    case 'PURCHASE_AGREEMENT':
      return 'Purchase Agreement';
    case 'VALUATION_MEMO':
      return 'Valuation Memo';
    case 'SALE_AGREEMENT':
      return 'Sale Agreement';
    case 'ENCUMBRANCE_CERTIFICATE':
      return 'Encumbrance Certificate';
    case 'KYC':
      return 'KYC';
    case 'INSURANCE':
      return 'Insurance';
    case 'FINANCIAL_STATEMENT':
      return 'Financial Statement';
    case 'CAP_TABLE':
      return 'Cap Table';
    case 'LPA':
      return 'LPA';
    default:
      return 'Other Documents';
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
const SEPOLIA_CHAIN_HEX = '0xaa36a7';
const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [owner, setOwner] = useState({
    holderName: '',
    ownershipType: 'LEGAL' as OwnershipType,
    percentage: 100,
    notes: '',
  });
  const [doc, setDoc] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    extractedText: '',
  });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const assetQuery = useQuery({
    queryKey: ['asset', params.id],
    queryFn: async () => (await api.get<HydratedAsset>(`/assets/${params.id}`)).data,
  });
  const docsQuery = useQuery({
    queryKey: ['documents', params.id],
    queryFn: async () => (await api.get<DocumentRow[]>(`/documents?assetId=${params.id}`)).data,
  });
  const docsTreeQuery = useQuery({
    queryKey: ['documents-tree', params.id],
    queryFn: async () =>
      (await api.get<AssetDocumentsTree>(`/documents/assets/${params.id}/folders`)).data,
  });
  const networkQuery = useQuery({
    queryKey: ['documents-network-status'],
    queryFn: async () =>
      (await api.get<DocumentNetworkStatus>('/documents/network-status')).data,
  });

  const runPipeline = useMutation({
    mutationFn: async () => api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
  const addOwnership = useMutation({
    mutationFn: async () => api.post(`/assets/${params.id}/ownerships`, owner),
    onSuccess: async () => {
      setOwner({ holderName: '', ownershipType: 'LEGAL', percentage: 100, notes: '' });
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
    },
  });
  const ingestDoc = useMutation({
    mutationFn: async () =>
      (await api.post<DocumentRow>('/documents', { ...doc, assetId: params.id })).data,
  });
  const uploadDoc = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      if (docFile) {
        body.append('file', docFile);
      }
      body.append('name', doc.name || docFile?.name || 'Untitled document');
      body.append('type', doc.type);
      body.append('assetId', params.id);
      if (doc.extractedText.trim()) {
        body.append('extractedText', doc.extractedText);
      }
      return api.post('/documents/upload', body, {
        transformResponse: undefined,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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

  const asset = assetQuery.data;
  const documents = docsQuery.data ?? [];
  const network = networkQuery.data;
  const canWalletAnchor = roles.includes('ORG_ADMIN') || roles.includes('PLATFORM_ADMIN');
  const fallbackFolders = useMemo<AssetDocumentsTree['folders']>(() => {
    const byType = new Map<DocumentType, DocumentRow[]>();
    for (const document of documents) {
      const bucket = byType.get(document.type) ?? [];
      bucket.push(document);
      byType.set(document.type, bucket);
    }

    return Array.from(byType.entries())
      .map(([type, docs]) => {
        const lineages = new Map<string, DocumentRow[]>();
        for (const document of docs) {
          const key = `${document.type}:${(document.name || '').trim().toLowerCase()}`;
          const bucket = lineages.get(key) ?? [];
          bucket.push(document);
          lineages.set(key, bucket);
        }

        const entries = Array.from(lineages.values())
          .map((versions) => versions.sort((a, b) => (b.version ?? 0) - (a.version ?? 0)))
          .map((versions) => {
            const current =
              versions.find((item) => item.isCurrent) ??
              versions[0];
            return {
              id: current?.id ?? '',
              name: current?.name ?? 'Untitled document',
              originalFilename: current?.originalFilename ?? current?.name ?? 'Untitled document',
              currentVersion: current?.version ?? 1,
              versionCount: versions.length,
              uploadedAt: current?.createdAt ?? '',
              uploadedByUserId: current?.uploadedByUserId,
              uploadedBy: current?.uploadedBy ?? null,
              status: (current?.versionStatus ?? (current?.isCurrent ? 'CURRENT' : 'PREVIOUS')) as
                | 'CURRENT'
                | 'PREVIOUS',
              documentStatus: current?.status ?? 'READY',
              anchorStatus: current?.anchorStatus,
              storageKey: current?.storageKey ?? '',
              versions,
            };
          })
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

        return {
          type,
          folderName: folderNameForType(type),
          documentCount: entries.length,
          totalVersions: docs.length,
          entries,
        };
      })
      .sort((a, b) => a.folderName.localeCompare(b.folderName));
  }, [documents]);
  const folders = docsTreeQuery.data?.folders?.length ? docsTreeQuery.data.folders : fallbackFolders;

  async function refreshAssetDocuments() {
    await api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' });
    await queryClient.invalidateQueries({ queryKey: ['documents', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['documents-tree', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
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
    if (!receipt || Number(receipt.status ?? 0) !== 1) {
      throw new Error(`Sepolia anchor transaction failed: ${tx.hash}`);
    }

    await recordAnchor.mutateAsync({
      documentId: document.id,
      transactionHash: tx.hash,
      walletAddress: signerAddress,
    });
    setWalletSession({
      ...session,
      account: signerAddress,
    });
    setWalletMessage(`Anchored on Sepolia: ${tx.hash}`);
  }

  async function handleDocumentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnchorError(null);
    let created: DocumentRow | null = null;
    try {
      created = docFile
        ? await uploadDoc.mutateAsync()
        : await ingestDoc.mutateAsync();

      if (canWalletAnchor && network?.contractAddress && created.documentHash) {
        const session = walletSession ?? (await connectWallet());
        await anchorDocumentWithWallet(created, session);
      }

      setDoc({ name: '', type: 'OTHER', extractedText: '' });
      setDocFile(null);
      await refreshAssetDocuments();
    } catch (error) {
      const message = readErrorMessage(error);
      setAnchorError(message);
      if (created) {
        await refreshAssetDocuments();
      }
    }
  }

  if (assetQuery.isLoading || !asset) {
    return <p className="text-sm text-[var(--muted)]">Loading asset…</p>;
  }

  const dna = asset.latestDna?.envelope;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            {assetClassLabel[asset.assetClass]}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{asset.name}</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">{asset.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={asset.status === 'ACTIVE' ? 'ok' : 'warn'}>{assetStatusLabel[asset.status]}</Badge>
          <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
            {asset.latestRisk?.payload.rating ?? 'No risk snapshot'}
          </Badge>
          <Button onClick={() => runPipeline.mutate()} disabled={runPipeline.isPending}>
            {runPipeline.isPending ? 'Running pipeline…' : 'Run Asset DNA'}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Marked value</p>
          <p className="mt-3 text-2xl font-semibold">
            {money(asset.latestValuation?.payload.amount, asset.latestValuation?.payload.currency ?? asset.currency)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">DNA version</p>
          <p className="mt-3 text-2xl font-semibold">{asset.latestDna ? `v${asset.latestDna.version}` : '—'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Confidence</p>
          <p className="mt-3 text-2xl font-semibold">{confidenceLabel(dna?.confidence.overall)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Documents</p>
          <p className="mt-3 text-2xl font-semibold">{asset.documentCount}</p>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-4 py-2 text-sm ${tab === item ? 'bg-[var(--ink)] text-white' : 'bg-white text-[var(--muted)]'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Master record</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <Row label="Location" value={asset.location} />
              <Row label="Jurisdiction" value={asset.jurisdiction} />
              <Row label="Created" value={formatDate(asset.creationDate)} />
              <Row label="Currency" value={asset.currency} />
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Intelligence summary</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
              {dna?.summary ?? 'No Asset DNA snapshot yet. Ingest documents and run the pipeline.'}
            </p>
            {dna ? (
              <div className="mt-6">
                <ConfidenceBar value={dna.confidence.overall} label="Overall" />
              </div>
            ) : null}
            <Link href={`/intelligence/dna/${asset.id}`} className="mt-4 inline-block text-sm underline">
              Open DNA explorer
            </Link>
          </Card>
        </div>
      ) : null}

      {tab === 'DNA' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Link href={`/intelligence/dna/${asset.id}`} className="text-sm underline">
              Full explorer
            </Link>
          </div>
          <FactSummaryTable
            title="Key extracted details"
            facts={(dna?.facts ?? []).map((fact) => ({
              id: fact.id,
              key: fact.key,
              label: fact.label,
              value: fact.value,
              confidence: fact.confidence,
              fragment: fact.provenance[0]?.sourceFragment,
            }))}
            emptyMessage="No extracted facts yet."
          />
        </div>
      ) : null}

      {tab === 'Documents' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Document folders</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Every upload is filed into the matching category folder. Reusing the same filename in the
              same folder creates a new version and preserves all older versions.
            </p>
            {docsTreeQuery.isLoading ? (
              <p className="mt-4 text-sm text-[var(--muted)]">Loading document folders…</p>
            ) : null}
            {docsTreeQuery.isError ? (
              <p className="mt-4 text-sm text-[var(--muted)]">
                Using document folders built from the asset’s saved document list.
              </p>
            ) : null}
            <div className="mt-4 space-y-4">
              {folders.map((folder) => (
                <div key={folder.type} className="rounded-2xl border border-[var(--line)] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{folder.folderName}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {folder.documentCount} current document{folder.documentCount === 1 ? '' : 's'} ·{' '}
                        {folder.totalVersions} stored version{folder.totalVersions === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge>{documentTypeLabel[folder.type]}</Badge>
                  </div>
                  {folder.entries.length ? (
                    <div className="mt-3 space-y-3">
                      {folder.entries.map((entry) => (
                        <div key={entry.id} className="rounded-xl bg-[var(--paper)]/70 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <Link href={`/documents/${entry.id}`} className="font-medium underline">
                                {entry.name}
                              </Link>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                Current version v{entry.currentVersion} · {entry.versionCount} total version
                                {entry.versionCount === 1 ? '' : 's'}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {entry.originalFilename} · Uploaded {formatDateTime(entry.uploadedAt)}
                                {entry.uploadedBy ? ` · By ${entry.uploadedBy}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge tone="ink">{entry.status}</Badge>
                              <Badge tone={entry.documentStatus === 'READY' ? 'ok' : 'warn'}>
                                {entry.documentStatus}
                              </Badge>
                              <Badge tone={anchorTone(entry.anchorStatus)}>
                                {entry.anchorStatus?.replaceAll('_', ' ') ?? 'Pending anchor'}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.versions.map((version) => (
                              <Link key={version.id} href={`/documents/${version.id}`}>
                                <Badge tone={version.versionStatus === 'CURRENT' ? 'ink' : 'muted'}>
                                  v{version.version} {version.versionStatus === 'CURRENT' ? 'Current' : 'Previous'}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--muted)]">No documents in this folder yet.</p>
                  )}
                </div>
              ))}
              {!docsTreeQuery.isLoading && !folders.length ? (
                <p className="text-sm text-[var(--muted)]">No document folders found for this asset yet.</p>
              ) : null}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Upload, connect, and anchor</h2>
            <div className="mt-4 rounded-2xl border border-[var(--line)] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Org admin wallet connection</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Upload stores the document off-chain first, then opens a real Sepolia wallet flow for signing.
                  </p>
                </div>
                <Badge tone={network?.contractAddress ? 'ok' : 'warn'}>
                  {network?.chainName ?? 'Sepolia'} {network?.contractAddress ? 'ready' : 'not configured'}
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
                  disabled={walletBusy || !canWalletAnchor}
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
                  Only an org admin can sign the Sepolia anchor transaction. Other roles can still upload documents,
                  and the version will remain pending until an org admin anchors it.
                </p>
              ) : null}
            </div>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => void handleDocumentSubmit(event)}
            >
              <Field label="File">
                <Input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    setDocFile(selected);
                    if (selected && !doc.name) {
                      setDoc((current) => ({ ...current, name: selected.name }));
                    }
                  }}
                />
              </Field>
              <Field label="Name">
                <Input value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value })} required />
              </Field>
              <Field label="Type">
                <Select
                  value={doc.type}
                  onChange={(e) => setDoc({ ...doc, type: e.target.value as DocumentType })}
                >
                  {documentTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Extracted / pasted text">
                <Textarea
                  rows={8}
                  value={doc.extractedText}
                  onChange={(e) => setDoc({ ...doc, extractedText: e.target.value })}
                  placeholder="Optional: paste text directly, or leave blank when uploading PDF / DOCX."
                />
              </Field>
              <Button
                type="submit"
                disabled={
                  ingestDoc.isPending ||
                  uploadDoc.isPending ||
                  recordAnchor.isPending ||
                  walletBusy
                }
              >
                {ingestDoc.isPending || uploadDoc.isPending || recordAnchor.isPending || walletBusy
                  ? 'Processing…'
                  : docFile
                    ? canWalletAnchor && network?.contractAddress
                      ? 'Upload, sign, and anchor on Sepolia'
                      : 'Upload, extract, and rebuild DNA'
                    : canWalletAnchor && network?.contractAddress
                      ? 'Add document and anchor on Sepolia'
                      : 'Add document'}
              </Button>
              <p className="text-xs leading-5 text-[var(--muted)]">
                Upload a PDF or DOCX to extract text automatically. The file is stored in the asset folder for
                its category, matching filenames create a new version instead of replacing older ones, and org
                admins can sign the anchor transaction with gas fees on Sepolia.
              </p>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === 'Ownership' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Holders</h2>
            <div className="mt-4 grid gap-3">
              {asset.ownerships.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                  <p className="font-medium">{item.holderName}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {item.type} · {item.percentage}% {item.asOf ? `· as of ${formatDate(item.asOf)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Add ownership</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                addOwnership.mutate();
              }}
            >
              <Field label="Holder">
                <Input
                  value={owner.holderName}
                  onChange={(e) => setOwner({ ...owner, holderName: e.target.value })}
                  required
                />
              </Field>
              <Field label="Type">
                <Select
                  value={owner.ownershipType}
                  onChange={(e) => setOwner({ ...owner, ownershipType: e.target.value as OwnershipType })}
                >
                  <option value="LEGAL">Legal</option>
                  <option value="BENEFICIAL">Beneficial</option>
                  <option value="ECONOMIC">Economic</option>
                </Select>
              </Field>
              <Field label="Percentage">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={owner.percentage}
                  onChange={(e) => setOwner({ ...owner, percentage: Number(e.target.value) })}
                />
              </Field>
              <Button type="submit" disabled={addOwnership.isPending}>
                Save ownership
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === 'Valuation & risk' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Valuation</h2>
            {asset.latestValuation ? (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-3xl font-semibold">
                  {money(asset.latestValuation.payload.amount, asset.latestValuation.payload.currency)}
                </p>
                <p className="text-[var(--muted)]">{asset.latestValuation.payload.method}</p>
                <p>As of {formatDate(asset.latestValuation.payload.asOf)}</p>
                <ConfidenceBar value={asset.latestValuation.payload.confidence} />
                <ul className="list-disc pl-5 text-[var(--muted)]">
                  {asset.latestValuation.payload.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">No valuation snapshot yet.</p>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Risk</h2>
            {asset.latestRisk ? (
              <div className="mt-4 space-y-4">
                <Badge tone={riskTone(asset.latestRisk.payload.rating)}>{asset.latestRisk.payload.rating}</Badge>
                {asset.latestRisk.payload.dimensions.map((dimension) => (
                  <div key={dimension.key}>
                    <p className="text-sm font-medium">
                      {dimension.label} · {dimension.score}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{dimension.rationale}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">No risk snapshot yet.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--line)] pb-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function anchorTone(status?: string) {
  if (status === 'BLOCKCHAIN_ANCHORED') {
    return 'ok';
  }
  if (status === 'ANCHOR_FAILED') {
    return 'danger';
  }
  return 'warn';
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
          chainId: SEPOLIA_CHAIN_HEX,
          chainName: network?.chainName ?? 'Ethereum Sepolia',
          rpcUrls: [network?.rpcUrl ?? DEFAULT_SEPOLIA_RPC],
          nativeCurrency: {
            name: 'Sepolia Ether',
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
  const ethereum = (window as Window & { ethereum?: WalletProviderLike }).ethereum;
  if (!ethereum) {
    return undefined;
  }
  if (ethereum.isMetaMask) {
    return ethereum;
  }
  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers.find((provider) => provider?.isMetaMask);
  }
  return undefined;
}
