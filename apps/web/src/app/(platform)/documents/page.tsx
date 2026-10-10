'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { api } from '@/lib/api';
import {
  assertSelectedNetwork,
  assertNextDocumentAnchorVersion,
  connectMetaMask,
  DOCUMENT_REGISTRY_ABI,
  ensureDocumentNetwork,
  normalizeHash,
  readErrorMessage,
  shortAddress,
  type DocumentNetworkStatus,
  type WalletSession,
} from '@/lib/document-wallet';
import {
  documentTypeLabel,
  documentTypeOptions,
  formatDateTime,
} from '@/lib/format';
import type { DocumentRow, HydratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';
import { selectedBlockchainNetwork, type BlockchainNetworkId } from '@/lib/blockchain-network';
import { walletBrowserProvider } from '@/lib/sepolia-marketplace';
import { useAuthStore } from '@/stores/auth-store';
import type { DocumentType } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Contract } from 'ethers';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudUpload,
  FileText,
  Folder,
  LayoutGrid,
  Link2,
  List,
  MoreVertical,
  Search,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';

const PAGE_SIZE = 8;

type ViewMode = 'list' | 'grid' | 'folder';
type StatusFilter = 'ALL' | 'VERIFIED' | 'PENDING' | 'REVIEW';
type DateFilter = 'ALL' | 'TODAY' | '7D' | '30D' | '90D' | 'YEAR';

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  ALL: 'All time',
  TODAY: 'Today',
  '7D': 'Last 7 days',
  '30D': 'Last 30 days',
  '90D': 'Last 90 days',
  YEAR: 'This year',
};

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function matchesDateFilter(createdAt: string, filter: DateFilter) {
  if (filter === 'ALL') return true;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const now = Date.now();
  if (filter === 'TODAY') return created >= startOfLocalDay();
  if (filter === '7D') return created >= now - 7 * 24 * 60 * 60 * 1000;
  if (filter === '30D') return created >= now - 30 * 24 * 60 * 60 * 1000;
  if (filter === '90D') return created >= now - 90 * 24 * 60 * 60 * 1000;
  if (filter === 'YEAR') {
    return created >= new Date(new Date().getFullYear(), 0, 1).getTime();
  }
  return true;
}

function formatBytes(size?: number) {
  if (!size || size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function typeBadge(type: DocumentType) {
  switch (type) {
    case 'VALUATION_MEMO':
      return { label: 'Valuation', tone: 'muted' as const };
    case 'KYC':
      return { label: 'KYC', tone: 'kyc' as const };
    case 'INSURANCE':
      return { label: 'Insurance', tone: 'ok' as const };
    case 'FINANCIAL_STATEMENT':
    case 'CAP_TABLE':
      return { label: 'Financial', tone: 'info' as const };
    case 'LPA':
    case 'OTHER':
      return { label: 'Compliance', tone: 'slate' as const };
    default:
      return { label: 'Legal', tone: 'legal' as const };
  }
}

function statusPresentation(status: string) {
  if (status === 'READY') return { label: 'Verified', tone: 'ok' as const };
  if (status === 'PROCESSING') return { label: 'In Review', tone: 'info' as const };
  if (status === 'FAILED') return { label: 'Failed', tone: 'danger' as const };
  return { label: 'Pending', tone: 'warn' as const };
}

function relativeTime(value?: string) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { address: connectedWallet } = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    assetId: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState('');
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [view, setView] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [networkId, setNetworkId] = useState<BlockchainNetworkId>(() =>
    selectedBlockchainNetwork().id,
  );

  useEffect(() => {
    const handleNetworkChange = () => setNetworkId(selectedBlockchainNetwork().id);
    window.addEventListener('caprov-network-changed', handleNetworkChange);
    return () => window.removeEventListener('caprov-network-changed', handleNetworkChange);
  }, []);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const documentsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await api.get<DocumentRow[]>('/documents')).data,
  });
  const networkQuery = useQuery({
    queryKey: ['documents-network-status', networkId],
    queryFn: async () =>
      (await api.get<DocumentNetworkStatus>('/documents/network-status')).data,
  });

  const assets = assetsQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const network = networkQuery.data;
  const defaultAssetId = assets[0]?.id ?? '';
  const formAssetId = form.assetId || defaultAssetId;
  const assetNameById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.name])),
    [assets],
  );

  const currentDocs = useMemo(
    () => documents.filter((doc) => doc.isCurrent !== false),
    [documents],
  );

  const verifiedCount = currentDocs.filter((doc) => doc.status === 'READY').length;
  const pendingCount = currentDocs.filter((doc) => doc.status === 'UPLOADED').length;
  const reviewCount = currentDocs.filter((doc) => doc.status === 'PROCESSING').length;
  const anchoredCount = currentDocs.filter(
    (doc) => doc.anchorStatus === 'BLOCKCHAIN_ANCHORED',
  ).length;
  const total = currentDocs.length || 1;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return currentDocs
      .filter((doc) => {
        if (assetFilter !== 'ALL' && doc.assetId !== assetFilter) return false;
        if (typeFilter !== 'ALL' && doc.type !== typeFilter) return false;
        if (statusFilter === 'VERIFIED' && doc.status !== 'READY') return false;
        if (statusFilter === 'PENDING' && doc.status !== 'UPLOADED') return false;
        if (statusFilter === 'REVIEW' && doc.status !== 'PROCESSING') return false;
        if (!matchesDateFilter(doc.createdAt, dateFilter)) return false;
        if (!term) return true;
        const assetName = doc.assetId ? assetNameById.get(doc.assetId) : '';
        return [doc.name, doc.originalFilename, documentTypeLabel[doc.type], assetName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [currentDocs, search, assetFilter, typeFilter, statusFilter, dateFilter, assetNameById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const pageSelected = pageItems.length > 0 && pageItems.every((doc) => selected.includes(doc.id));

  const activity = useMemo(() => {
    return [...currentDocs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((doc) => {
        if (doc.status === 'READY') {
          return {
            id: doc.id,
            title: 'Document verified',
            detail: doc.name,
            time: relativeTime(doc.createdAt),
            icon: CheckCircle2,
          };
        }
        if (doc.anchorStatus === 'BLOCKCHAIN_ANCHORED') {
          return {
            id: doc.id,
            title: 'Document anchored',
            detail: doc.name,
            time: relativeTime(doc.anchoredAt ?? doc.createdAt),
            icon: Link2,
          };
        }
        return {
          id: doc.id,
          title: 'New document uploaded',
          detail: doc.name,
          time: relativeTime(doc.createdAt),
          icon: Upload,
        };
      });
  }, [currentDocs]);

  const paginationNumbers = useMemo(() => {
    const maxButtons = 7;
    if (pageCount <= maxButtons) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const start = Math.max(1, Math.min(currentPage - 3, pageCount - maxButtons + 1));
    return Array.from({ length: maxButtons }, (_, index) => start + index);
  }, [pageCount, currentPage]);

  const ingest = useMutation({
    mutationFn: async () =>
      (
        await api.post<DocumentRow>('/documents', {
          name: form.name,
          type: form.type,
          assetId: formAssetId,
          extractedText: form.notes,
        })
      ).data,
  });

  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      if (file) body.append('file', file);
      body.append('name', form.name || file?.name || 'Untitled document');
      body.append('type', form.type);
      body.append('assetId', formAssetId);
      if (form.notes.trim()) body.append('extractedText', form.notes);
      return api
        .post('/documents/upload', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((response) => response.data as DocumentRow);
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

  const canWalletAnchor = Boolean(user);
  const liveDocumentAnchoringReady = Boolean(network?.liveReady && network.contractAddress);
  const submitBusy = ingest.isPending || upload.isPending || recordAnchor.isPending || walletBusy;

  async function refreshDocuments() {
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    await queryClient.invalidateQueries({ queryKey: ['assets'] });
  }

  async function connectWallet(
    targetNetwork: DocumentNetworkStatus | undefined = network,
  ): Promise<WalletSession> {
    setWalletBusy(true);
    setAnchorError(null);
    setWalletMessage('Using the wallet connected from the top-right menu…');
    try {
      const session = await connectMetaMask(targetNetwork);
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

  async function anchorDocumentWithWallet(
    document: DocumentRow,
    session: WalletSession,
    targetNetwork: DocumentNetworkStatus,
  ) {
    if (!document.assetId || !document.documentHash || !document.offChainUri) {
      throw new Error('The uploaded document is missing anchor metadata.');
    }
    if (!targetNetwork.contractAddress) {
      throw new Error(`${targetNetwork.chainName} document registry contract is not configured.`);
    }

    assertSelectedNetwork(targetNetwork);
    await ensureDocumentNetwork(session.provider, targetNetwork);
    const currentBrowserProvider = walletBrowserProvider(session.provider, targetNetwork.chainId);
    const signer = await currentBrowserProvider.getSigner(session.account);
    const signerAddress = await signer.getAddress();
    const contract = new Contract(targetNetwork.contractAddress, DOCUMENT_REGISTRY_ABI, signer);
    const requestedVersion = await assertNextDocumentAnchorVersion(contract, {
      assetId: document.assetId,
      id: document.id,
      type: document.type,
      name: document.name,
      version: document.version,
      documentHash: document.documentHash,
    });
    const anchorFn = contract.getFunction('anchorDocumentVersion');
    setWalletMessage('Awaiting MetaMask signature…');
    const tx = await anchorFn(
      document.assetId,
      document.id,
      document.type,
      document.name,
      requestedVersion,
      normalizeHash(document.documentHash),
      normalizeHash(document.previousVersionHash),
      document.offChainUri,
    );
    setWalletMessage(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    const transactionHash = receipt?.hash ?? tx.hash;
    if (!receipt || Number(receipt.status ?? 0) !== 1) {
      throw new Error(`${targetNetwork.chainName} anchor transaction failed: ${transactionHash}`);
    }

    await recordAnchor.mutateAsync({
      documentId: document.id,
      transactionHash,
      walletAddress: signerAddress,
    });
    setWalletSession({ ...session, account: signerAddress });
    setWalletMessage(`Anchored on ${targetNetwork.chainName}: ${transactionHash}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setAnchorError(null);
    if (!formAssetId) {
      setFormError('Select the asset this document belongs to.');
      return;
    }
    if (!file && !form.notes.trim()) {
      setFormError('Add a file or notes so the document has content to ingest.');
      return;
    }

    let created: DocumentRow | null = null;
    try {
      created = file ? await upload.mutateAsync() : await ingest.mutateAsync();
      if (canWalletAnchor && created.documentHash) {
        const currentNetwork = (
          await api.get<DocumentNetworkStatus>('/documents/network-status')
        ).data;
        assertSelectedNetwork(currentNetwork);
        if (!currentNetwork.liveReady || !currentNetwork.contractAddress) {
          throw new Error(
            `${currentNetwork.chainName} anchoring is not ready: ${currentNetwork.message || 'the document-registry contract is not configured.'}`,
          );
        }
        const session = walletSession ?? (await connectWallet(currentNetwork));
        await anchorDocumentWithWallet(created, session, currentNetwork);
      }
      setForm((current) => ({ ...current, name: '', type: 'OTHER', notes: '' }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshDocuments();
    } catch (error) {
      setAnchorError(readErrorMessage(error));
      if (created) await refreshDocuments();
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (!dropped) return;
    setFile(dropped);
    setForm((current) => ({
      ...current,
      name: current.name || dropped.name,
    }));
  }

  function toggleAllOnPage() {
    if (pageSelected) {
      setSelected((ids) => ids.filter((id) => !pageItems.some((doc) => doc.id === id)));
      return;
    }
    setSelected((ids) => [...new Set([...ids, ...pageItems.map((doc) => doc.id)])]);
  }

  return (
    <div className="docs-mgmt docs-mgmt--fit mx-auto w-full max-w-[92rem]">
      <section className="docs-mgmt__hero">
        <div className="docs-mgmt__hero-copy-block">
          <p className="docs-mgmt__eyebrow">Documents</p>
          <h1 className="docs-mgmt__title">Document Management</h1>
          <p className="docs-mgmt__hero-copy">
            Upload, classify, and track source evidence across every private asset in your workspace.
          </p>
        </div>
        <div className="docs-mgmt__hero-actions">
          <button
            type="button"
            className={cn('docs-mgmt__btn', view === 'folder' && 'docs-mgmt__btn--active')}
            onClick={() => setView((current) => (current === 'folder' ? 'list' : 'folder'))}
          >
            <Folder size={15} />
            Folder view
          </button>
          <button
            type="button"
            className="docs-mgmt__btn docs-mgmt__btn--primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} />
            Upload documents
          </button>
        </div>
      </section>

      <section className="docs-mgmt__stats">
        <article className="docs-mgmt__stat">
          <span className="docs-mgmt__stat-icon docs-mgmt__stat-icon--gold">
            <FileText size={15} />
          </span>
          <div>
            <p className="docs-mgmt__stat-label">Total documents</p>
            <p className="docs-mgmt__stat-value">{currentDocs.length}</p>
            <p className="docs-mgmt__stat-delta docs-mgmt__stat-delta--up">+12% vs last month</p>
          </div>
        </article>
        <article className="docs-mgmt__stat">
          <span className="docs-mgmt__stat-icon docs-mgmt__stat-icon--ok">
            <CheckCircle2 size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="docs-mgmt__stat-label">Verified documents</p>
            <p className="docs-mgmt__stat-value">{verifiedCount}</p>
            <p className="docs-mgmt__stat-hint">{Math.round((verifiedCount / total) * 100)}% of total</p>
            <span className="docs-mgmt__meter">
              <span style={{ width: `${(verifiedCount / total) * 100}%`, background: 'var(--ok)' }} />
            </span>
          </div>
        </article>
        <article className="docs-mgmt__stat">
          <span className="docs-mgmt__stat-icon docs-mgmt__stat-icon--warn">
            <Clock3 size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="docs-mgmt__stat-label">Pending review</p>
            <p className="docs-mgmt__stat-value">{pendingCount + reviewCount}</p>
            <p className="docs-mgmt__stat-hint">
              {Math.round(((pendingCount + reviewCount) / total) * 100)}% of total
            </p>
            <span className="docs-mgmt__meter">
              <span
                style={{
                  width: `${((pendingCount + reviewCount) / total) * 100}%`,
                  background: 'var(--gold)',
                }}
              />
            </span>
          </div>
        </article>
        <article className="docs-mgmt__stat">
          <span className="docs-mgmt__stat-icon docs-mgmt__stat-icon--info">
            <Link2 size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="docs-mgmt__stat-label">Blockchain anchored</p>
            <p className="docs-mgmt__stat-value">{anchoredCount}</p>
            <p className="docs-mgmt__stat-hint">{Math.round((anchoredCount / total) * 100)}% of total</p>
            <span className="docs-mgmt__meter">
              <span style={{ width: `${(anchoredCount / total) * 100}%`, background: '#3b82f6' }} />
            </span>
          </div>
        </article>
      </section>

      {assets.length === 0 ? (
        <section className="docs-mgmt__panel p-8">
          <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
            Create an asset before you upload documents
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Documents are filed against each asset. Once an asset exists, uploads go into the matching
            category and are versioned by filename.
          </p>
          <Link href="/assets/new" className="docs-mgmt__btn docs-mgmt__btn--primary mt-5 inline-flex">
            Create asset
          </Link>
        </section>
      ) : (
        <div className="docs-mgmt__layout">
          <div className="docs-mgmt__main">
            <section className="docs-mgmt__toolbar">
              <label className="docs-mgmt__search">
                <Search size={15} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search documents…"
                />
              </label>
              <select
                className="docs-mgmt__select"
                value={assetFilter}
                onChange={(event) => {
                  setAssetFilter(event.target.value);
                  setPage(1);
                }}
                aria-label="Asset"
              >
                <option value="ALL">Asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
              <select
                className="docs-mgmt__select"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as DocumentType | 'ALL');
                  setPage(1);
                }}
                aria-label="Document type"
              >
                <option value="ALL">Document type</option>
                {documentTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="docs-mgmt__select"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setPage(1);
                }}
                aria-label="Status"
              >
                <option value="ALL">Status</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING">Pending</option>
                <option value="REVIEW">In Review</option>
              </select>
              <select
                className="docs-mgmt__select"
                value={dateFilter}
                onChange={(event) => {
                  setDateFilter(event.target.value as DateFilter);
                  setPage(1);
                }}
                aria-label="Date uploaded"
              >
                {(Object.keys(DATE_FILTER_LABEL) as DateFilter[]).map((value) => (
                  <option key={value} value={value}>
                    Date: {DATE_FILTER_LABEL[value]}
                  </option>
                ))}
              </select>
              <div className="docs-mgmt__views" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={cn(view === 'list' && 'is-active')}
                  aria-label="List view"
                  onClick={() => setView('list')}
                >
                  <List size={15} />
                </button>
                <button
                  type="button"
                  className={cn(view === 'grid' && 'is-active')}
                  aria-label="Grid view"
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
            </section>

            <section className="docs-mgmt__panel docs-mgmt__table-shell">
              {view === 'folder' ? (
                <div className="docs-mgmt__table-scroll p-4">
                  <div className="grid gap-3">
                    {Object.entries(
                      filtered.reduce<Record<string, DocumentRow[]>>((groups, doc) => {
                        const key = documentTypeLabel[doc.type] ?? 'Other';
                        (groups[key] ??= []).push(doc);
                        return groups;
                      }, {}),
                    ).map(([folder, docs]) => (
                      <div key={folder} className="rounded-xl border border-[var(--line)] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Folder size={15} className="text-[var(--gold)]" />
                            <h3 className="font-semibold text-[var(--ink)]">{folder}</h3>
                          </div>
                          <span className="text-xs text-[var(--muted)]">{docs.length} files</span>
                        </div>
                        <ul className="mt-3 divide-y divide-[var(--line)]/80">
                          {docs.slice(0, 6).map((doc) => (
                            <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                              <Link
                                href={`/documents/${doc.id}`}
                                className="min-w-0 truncate text-sm font-medium text-[var(--ink)] hover:underline"
                              >
                                {doc.name}
                              </Link>
                              <span className="shrink-0 text-xs text-[var(--muted)]">
                                v{doc.version ?? 1}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : view === 'grid' ? (
                <div className="docs-mgmt__grid-scroll">
                  {pageItems.map((doc) => {
                    const badge = typeBadge(doc.type);
                    const status = statusPresentation(doc.status);
                    return (
                      <Link key={doc.id} href={`/documents/${doc.id}`} className="docs-mgmt__card">
                        <span className="docs-mgmt__file-icon">
                          <FileText size={18} />
                        </span>
                        <p className="mt-3 truncate font-semibold text-[var(--ink)]">{doc.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{formatBytes(doc.sizeBytes)}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={cn('docs-mgmt__type', `docs-mgmt__type--${badge.tone}`)}>
                            {badge.label}
                          </span>
                          <span className={cn('docs-mgmt__status', `docs-mgmt__status--${status.tone}`)}>
                            <span />
                            {status.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="docs-mgmt__table-scroll">
                  <table className="docs-mgmt__table w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="w-10">
                          <input
                            type="checkbox"
                            checked={pageSelected}
                            onChange={toggleAllOnPage}
                            aria-label="Select all on page"
                          />
                        </th>
                        <th>Document</th>
                        <th>Type</th>
                        <th>Asset</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Uploaded by</th>
                        <th>Date</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.length ? (
                        pageItems.map((doc) => {
                          const badge = typeBadge(doc.type);
                          const status = statusPresentation(doc.status);
                          const assetName = doc.assetId
                            ? assetNameById.get(doc.assetId) ?? doc.assetId
                            : '—';
                          return (
                            <tr key={doc.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selected.includes(doc.id)}
                                  onChange={() =>
                                    setSelected((ids) =>
                                      ids.includes(doc.id)
                                        ? ids.filter((id) => id !== doc.id)
                                        : [...ids, doc.id],
                                    )
                                  }
                                  aria-label={`Select ${doc.name}`}
                                />
                              </td>
                              <td>
                                <Link href={`/documents/${doc.id}`} className="docs-mgmt__doc">
                                  <span className="docs-mgmt__file-icon">
                                    <FileText size={15} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="docs-mgmt__doc-name">{doc.name}</span>
                                    <span className="docs-mgmt__doc-meta">
                                      {formatBytes(doc.sizeBytes)}
                                      {doc.originalFilename ? ` · ${doc.originalFilename}` : ''}
                                    </span>
                                  </span>
                                </Link>
                              </td>
                              <td>
                                <span className={cn('docs-mgmt__type', `docs-mgmt__type--${badge.tone}`)}>
                                  {badge.label}
                                </span>
                              </td>
                              <td>
                                <span className="block font-medium text-[var(--ink)]">{assetName}</span>
                                <span className="block font-mono text-[10px] text-[var(--muted)]">
                                  {doc.assetId ? `${doc.assetId.slice(0, 8)}…` : '—'}
                                </span>
                              </td>
                              <td className="tabular-nums text-[var(--muted)]">
                                v{doc.version ?? 1}
                              </td>
                              <td>
                                <span
                                  className={cn(
                                    'docs-mgmt__status',
                                    `docs-mgmt__status--${status.tone}`,
                                  )}
                                >
                                  <span />
                                  {status.label}
                                </span>
                              </td>
                              <td className="text-[var(--muted)]">{doc.uploadedBy ?? '—'}</td>
                              <td className="whitespace-nowrap text-[var(--muted)]">
                                {formatDateTime(doc.createdAt)}
                              </td>
                              <td>
                                <Link
                                  href={`/documents/${doc.id}`}
                                  className="docs-mgmt__more"
                                  aria-label={`Open ${doc.name}`}
                                >
                                  <MoreVertical size={15} />
                                </Link>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                            No documents match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <footer className="docs-mgmt__footer">
                <p>
                  Showing {showingFrom} to {showingTo} of {filtered.length} documents
                  {selected.length ? ` · ${selected.length} selected` : ''}
                </p>
                <div className="docs-mgmt__pager">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {paginationNumbers.map((number) => (
                    <button
                      key={number}
                      type="button"
                      className={cn(number === currentPage && 'is-active')}
                      onClick={() => setPage(number)}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </footer>
            </section>
          </div>

          <aside className="docs-mgmt__aside">
            <section className="docs-mgmt__panel docs-mgmt__upload">
              <h2 className="docs-mgmt__panel-title">Upload a document</h2>
              <form className="mt-3 grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
                <label
                  className={cn('docs-mgmt__dropzone', dragOver && 'is-active')}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <CloudUpload size={22} />
                  <strong>{file ? file.name : 'Drag & drop a file here'}</strong>
                  <span>{file ? formatBytes(file.size) : 'PDF, DOCX, TXT, CSV, or JSON'}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => {
                      const selected = event.target.files?.[0] ?? null;
                      setFile(selected);
                      if (selected && !form.name) {
                        setForm((current) => ({ ...current, name: selected.name }));
                      }
                    }}
                  />
                </label>

                <label className="docs-mgmt__field">
                  <span>Asset</span>
                  <select
                    value={formAssetId}
                    onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))}
                    required
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="docs-mgmt__field">
                  <span>Document type</span>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, type: event.target.value as DocumentType }))
                    }
                  >
                    {documentTypeOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="docs-mgmt__field">
                  <span>Document name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Optional — defaults to filename"
                  />
                </label>

                <label className="docs-mgmt__field">
                  <span>Notes (optional)</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Add context for reviewers"
                  />
                </label>

                {formError ? <p className="text-xs text-[var(--danger)]">{formError}</p> : null}
                {walletMessage ? <p className="text-xs text-[var(--muted)]">{walletMessage}</p> : null}
                {anchorError ? <p className="text-xs text-[var(--danger)]">{anchorError}</p> : null}
                {connectedWallet ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Anchoring via {shortAddress(connectedWallet)}
                    {liveDocumentAnchoringReady ? ` on ${network?.chainName}` : ' (anchor offline)'}
                  </p>
                ) : null}

                <button type="submit" className="docs-mgmt__btn docs-mgmt__btn--primary w-full" disabled={submitBusy}>
                  {submitBusy ? 'Processing…' : 'Upload document'}
                </button>
              </form>
            </section>

            <section className="docs-mgmt__panel docs-mgmt__activity">
              <div className="flex items-center justify-between gap-3">
                <h2 className="docs-mgmt__panel-title">Recent activity</h2>
                <Link href="/audit" className="text-xs font-semibold text-[var(--gold)]">
                  View all
                </Link>
              </div>
              <ul className="mt-3 grid gap-0">
                {activity.map((item, index) => (
                  <li key={`${item.id}-${item.title}`} className="docs-mgmt__feed-item">
                    <span className="docs-mgmt__feed-rail" aria-hidden="true">
                      <span className="docs-mgmt__feed-dot">
                        <item.icon size={12} />
                      </span>
                      {index < activity.length - 1 ? <span className="docs-mgmt__feed-line" /> : null}
                    </span>
                    <span className="min-w-0 pb-3.5">
                      <strong className="block text-sm font-medium text-[var(--ink)]">{item.title}</strong>
                      <Link
                        href={`/documents/${item.id}`}
                        className="mt-0.5 block truncate text-xs text-[var(--gold)] hover:underline"
                      >
                        {item.detail}
                      </Link>
                      <span className="mt-1 block text-[11px] text-[var(--muted)]">{item.time}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
