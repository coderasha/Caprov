'use client';

import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DnaDecisionTable } from '@/components/intelligence/dna-decision-table';
import { FactSummaryTable } from '@/components/intelligence/fact-summary-table';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { activeMetaMaskConnection, ensureProviderChain, walletBrowserProvider } from '@/lib/sepolia-marketplace';
import {
  selectedBlockchainNetwork,
  type BlockchainNetworkId,
} from '@/lib/blockchain-network';
import {
  assetClassLabel,
  assetStatusLabel,
  documentTypeLabel,
  documentTypeOptions,
  formatDate,
  formatDateTime,
  money,
  riskTone,
} from '@/lib/format';
import type { AssetDocumentsTree, AuditRow, DocumentRow, HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import type { DocumentType, OwnershipType } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserProvider, Contract, solidityPackedKeccak256 } from 'ethers';
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, CheckCircle2, Download, FileText, Landmark, MapPin, ScanSearch, Share2, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

const tabs = ['Overview', 'DNA', 'Documents', 'Ownership', 'Valuation & risk', 'Audit'] as const;

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
  networkId: BlockchainNetworkId;
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
  accounts: string[];
  chainId: number;
  provider: WalletProviderLike;
  browserProvider: BrowserProvider;
}

const DOCUMENT_REGISTRY_ABI = [
  'function anchorDocumentVersion(string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)',
  'function latestVersionByLineage(bytes32 lineageKey) view returns (uint256)',
  'function getDocumentVersion(bytes32 lineageKey, uint256 version) view returns (string assetId, string documentId, string documentType, string documentName, uint256 storedVersion, bytes32 documentHash, uint256 anchoredAt, bytes32 previousVersionHash, string offChainUri, bool exists)',
] as const;


export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const bankerOnly = roles.includes('BANKER') && !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));
  const requestedTab = searchParams.get('tab')?.toLowerCase();
  const initialTab = requestedTab === 'documents' ? 'Documents' : 'Overview';
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab);
  const [owner, setOwner] = useState({
    holderName: '',
    ownershipType: 'LEGAL' as OwnershipType,
    percentage: 100,
    notes: '',
  });
  const [ownershipDraft, setOwnershipDraft] = useState<Array<typeof owner>>([]);
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
  const [networkId, setNetworkId] = useState<BlockchainNetworkId>(() =>
    selectedBlockchainNetwork().id,
  );
  const { address: connectedWallet } = useWallet();

  useEffect(() => {
    const handleNetworkChange = () => setNetworkId(selectedBlockchainNetwork().id);
    window.addEventListener('caprov-network-changed', handleNetworkChange);
    return () => window.removeEventListener('caprov-network-changed', handleNetworkChange);
  }, []);

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
    queryKey: ['documents-network-status', networkId],
    queryFn: async () =>
      (await api.get<DocumentNetworkStatus>('/documents/network-status')).data,
  });
  const auditQuery = useQuery({
    queryKey: ['asset-audit', params.id],
    queryFn: async () => (await api.get<AuditRow[]>(`/audit/assets/${params.id}`)).data,
  });

  const runPipeline = useMutation({
    mutationFn: async () => api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
  const saveOwnerships = useMutation({
    mutationFn: async () =>
      api.put(`/assets/${params.id}/ownerships`, { ownerships: ownershipDraft }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['dna', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
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
  useEffect(() => {
    if (assetQuery.data) {
      setOwnershipDraft(
        assetQuery.data.ownerships.map((item) => ({
          holderName: item.holderName,
          ownershipType: item.type,
          percentage: item.percentage,
          asOf: item.asOf,
          notes: item.notes ?? '',
        })),
      );
    }
  }, [assetQuery.data?.id, assetQuery.data?.updatedAt]);
  const canWalletAnchor = Boolean(user);
  const liveDocumentAnchoringReady = Boolean(network?.liveReady && network.contractAddress);
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
  const folders = (docsTreeQuery.data?.folders?.length ? docsTreeQuery.data.folders : fallbackFolders).filter(
    (folder) => folder.type !== 'SPA',
  );

  async function refreshAssetDocuments() {
    await api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' });
    await queryClient.invalidateQueries({ queryKey: ['documents', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['documents-tree', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
    await queryClient.invalidateQueries({ queryKey: ['jobs'] });
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
    targetNetwork: DocumentNetworkStatus = network!,
  ) {
    if (!document.assetId || !document.documentHash || !document.offChainUri) {
      throw new Error('The uploaded document is missing anchor metadata.');
    }
    if (!targetNetwork?.contractAddress) {
      throw new Error(`${targetNetwork?.chainName ?? 'Selected network'} document registry contract is not configured.`);
    }

    assertSelectedNetwork(targetNetwork);
    await ensureDocumentNetwork(session.provider, targetNetwork);
    const currentBrowserProvider = walletBrowserProvider(
      session.provider,
      targetNetwork.chainId,
    );
    const signer = await currentBrowserProvider.getSigner(session.account);
    const signerAddress = await signer.getAddress();
    const contract = new Contract(targetNetwork.contractAddress, DOCUMENT_REGISTRY_ABI, signer);
    const requestedVersion = BigInt(document.version ?? 1);
    const lineageKey = solidityPackedKeccak256(
      ['string', 'string', 'string', 'string', 'string'],
      [document.assetId, '|', document.type, '|', document.name],
    );
    const latestVersion = BigInt(await contract.getFunction('latestVersionByLineage')(lineageKey));
    if (requestedVersion !== latestVersion + 1n) {
      let detail = `Besu expects version ${latestVersion + 1n}, but this document is version ${requestedVersion}.`;
      if (requestedVersion <= latestVersion) {
        const existing = await contract.getFunction('getDocumentVersion')(lineageKey, requestedVersion);
        const existingDocumentId = existing[1] as string;
        const existingHash = existing[5] as string;
        if (
          existingDocumentId === document.id &&
          existingHash.toLowerCase() === normalizeHash(document.documentHash).toLowerCase()
        ) {
          detail = 'This exact document version is already anchored on Besu. Refresh the page; do not submit it again.';
        }
      }
      throw new Error(`${detail} Create the next document version before anchoring, or use a fresh Besu document-registry deployment for a clean test network.`);
    }
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
    setWalletSession({
      ...session,
      account: signerAddress,
    });
    setWalletMessage(`Anchored on ${targetNetwork.chainName}: ${transactionHash}`);
  }

  async function handleDocumentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnchorError(null);
    let created: DocumentRow | null = null;
    try {
      created = docFile
        ? await uploadDoc.mutateAsync()
        : await ingestDoc.mutateAsync();

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
        const tree = (await api.get<AssetDocumentsTree>(`/documents/assets/${params.id}/folders`)).data;
        const lineage = tree.folders
          .flatMap((folder) => folder.entries)
          .find((entry) => entry.versions.some((version) => version.id === created!.id));
        if (!lineage) throw new Error('The uploaded document lineage could not be loaded for anchoring.');
        await anchorDocumentVersionsSequentially(lineage.versions);
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

  async function anchorExistingDocument(document: DocumentRow) {
    setAnchorError(null);
    setWalletMessage('Checking the selected network before requesting a signature…');
    try {
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
      await anchorDocumentWithWallet(document, session, currentNetwork);
      await refreshAssetDocuments();
    } catch (error) {
      setAnchorError(readErrorMessage(error));
    }
  }

  /** Process a lineage oldest-to-newest; the registry accepts only its next version. */
  async function anchorDocumentVersionsSequentially(documents: DocumentRow[]) {
    setAnchorError(null);
    const pending = [...documents]
      .filter((document) => document.anchorStatus !== 'BLOCKCHAIN_ANCHORED')
      .sort((left, right) => Number(left.version ?? 1) - Number(right.version ?? 1));
    if (!pending.length) {
      setWalletMessage('All document versions in this lineage are already anchored.');
      return;
    }
    try {
      const currentNetwork = (await api.get<DocumentNetworkStatus>('/documents/network-status')).data;
      assertSelectedNetwork(currentNetwork);
      if (!currentNetwork.liveReady || !currentNetwork.contractAddress) {
        throw new Error(`${currentNetwork.chainName} anchoring is not ready: ${currentNetwork.message || 'the document-registry contract is not configured.'}`);
      }
      const session = walletSession ?? (await connectWallet(currentNetwork));
      for (let index = 0; index < pending.length; index += 1) {
        const document = pending[index]!;
        setWalletMessage(`Anchoring version ${document.version} (${index + 1} of ${pending.length}). Confirm the MetaMask transaction…`);
        await anchorDocumentWithWallet(document, session, currentNetwork);
      }
      await refreshAssetDocuments();
      setWalletMessage(`Anchored ${pending.length} document version${pending.length === 1 ? '' : 's'} on ${currentNetwork.chainName}.`);
    } catch (error) {
      await refreshAssetDocuments();
      setAnchorError(readErrorMessage(error));
    }
  }

  if (assetQuery.isLoading || !asset) {
    return <p className="text-sm text-[var(--muted)]">Loading asset…</p>;
  }

  const dna = asset.latestDna?.envelope;
  const valuation = asset.latestValuation?.payload;
  const keyFacts = (dna?.facts ?? []).slice(0, 8);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/assets" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink)] transition hover:text-[var(--gold)]"><ArrowLeft size={16} />Back to assets</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="gap-2"><Share2 size={16} />Share</Button>
          <Button variant="secondary" className="gap-2"><Download size={16} />Download report</Button>
          {!bankerOnly ? <Button onClick={() => setTab('Documents')} className="gap-2"><Upload size={16} />Upload documents</Button> : null}
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{asset.name}</h1><Badge tone={asset.status === 'ACTIVE' ? 'ok' : 'warn'}>{assetStatusLabel[asset.status]}</Badge></div>
          <p className="mt-1.5 max-w-3xl text-sm text-[var(--muted)]">{asset.description || 'A complete asset profile with verified documents, valuation intelligence, and provenance.'}</p>
        </div>
        {!bankerOnly ? <Button variant="secondary" onClick={() => runPipeline.mutate()} disabled={runPipeline.isPending} className="gap-2"><Sparkles size={16} />{runPipeline.isPending ? 'Running Asset DNA…' : 'Refresh Asset DNA'}</Button> : null}
      </header>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="min-h-44 bg-[var(--paper)]">
            {asset.primaryImageUrl ? <img src={asset.primaryImageUrl} alt={asset.name} className="h-full min-h-44 w-full object-cover" /> : <div className="grid h-full min-h-44 place-items-center text-[var(--gold)]"><Building2 size={42} /></div>}
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{asset.name}</h2><span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{assetClassLabel[asset.assetClass]}</span></div>
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]"><MapPin size={16} className="text-[var(--gold)]" />{asset.location || asset.jurisdiction || 'Location pending verification'}</p>
            <div className="mt-5 grid divide-y divide-[var(--line)] border-t border-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
              <ProfileMetric label="Asset type" value={assetClassLabel[asset.assetClass]} />
              <ProfileMetric label="Current valuation" value={money(valuation?.amount, valuation?.currency ?? asset.currency)} />
              <ProfileMetric label="Valuation date" value={formatDate(valuation?.asOf)} />
              <ProfileMetric label="DNA version" value={asset.latestDna ? `v${asset.latestDna.version}` : 'Not generated'} />
              <ProfileMetric label="Supporting documents" value={`${asset.documentCount} records`} />
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white/70 p-1.5">
        {tabs.filter((item) => !bankerOnly || item !== 'Ownership').map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === item ? 'bg-[var(--ink)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
          <Card className="overflow-hidden p-0"><PanelHeading icon={<ScanSearch size={20} />} title="Extracted information" subtitle="Key details automatically derived from verified document evidence." tag={dna ? 'AI extracted' : undefined} />
            <dl className="px-5 pb-3 text-sm">
              {(keyFacts.length ? keyFacts : [{ id: 'location', label: 'Location', value: asset.location || 'Pending verification' }, { id: 'jurisdiction', label: 'Jurisdiction', value: asset.jurisdiction || '—' }, { id: 'created', label: 'Creation date', value: formatDate(asset.creationDate) }]).map((fact) => <Row key={fact.id} label={fact.label} value={fact.value} />)}
            </dl>
          </Card>
          <div className="space-y-4">
            <Card className="overflow-hidden p-0"><PanelHeading icon={<Landmark size={20} />} title="Valuation details" subtitle="Latest mark extracted from valuation evidence." />
              <div className="grid gap-px border-y border-[var(--line)] bg-[var(--line)] sm:grid-cols-3"><div className="bg-[#fff1d9] p-4 sm:col-span-1"><p className="text-xs text-[#8a5a12]">Current estimated value</p><p className="mt-1 text-xl font-semibold">{money(valuation?.amount, valuation?.currency ?? asset.currency)}</p></div><ProfileMetric label="Valuation date" value={formatDate(valuation?.asOf)} /><ProfileMetric label="Method" value={valuation?.method || 'Pending'} /></div>
              <dl className="px-5 py-2 text-sm"><Row label="Valuation source" value={valuation?.notes?.[0] || 'No supporting valuation report'} /><Row label="Risk assessment" value={asset.latestRisk?.payload.rating || 'Not assessed'} /></dl>
            </Card>
            <Card className="overflow-hidden p-0"><PanelHeading icon={<CheckCircle2 size={20} />} title="Key extracted facts" subtitle="Important information summarized from uploaded documents." />
              <div className="px-5 pb-3">{keyFacts.length ? keyFacts.slice(0, 5).map((fact) => <div key={fact.id} className="flex gap-3 border-t border-[var(--line)] py-2 text-sm"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--gold)]" /><span className="min-w-0 text-[var(--muted)]">{fact.label}:</span><span className="min-w-0 font-medium">{fact.value}</span></div>) : <p className="py-5 text-sm text-[var(--muted)]">Run Asset DNA after uploading source documents to populate verified facts.</p>}</div>
            </Card>
          </div>
          <Card className="overflow-hidden p-0"><PanelHeading icon={<MapPin size={20} />} title="Location" subtitle="Asset location from the master record and verified documents." />
            <div className="mx-5 mb-5 grid min-h-52 place-items-center rounded-xl border border-[#ddd6c8] bg-[linear-gradient(135deg,#e8eee5,#f5f0e7)] p-5 text-center"><div><MapPin className="mx-auto text-[var(--gold)]" size={30} /><p className="mt-3 font-semibold">{asset.location || 'Location pending'}</p><p className="mt-1 text-sm text-[var(--muted)]">{asset.jurisdiction || 'Add jurisdiction to complete the location record.'}</p><button type="button" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--ink)] underline underline-offset-4">View on map <ArrowUpRight size={14} /></button></div></div>
          </Card>
          <Card className="overflow-hidden p-0"><PanelHeading icon={<FileText size={20} />} title="Supporting documents" subtitle="Documents used for intelligence and valuation." action={<button type="button" onClick={() => setTab('Documents')} className="text-sm font-medium text-[var(--ink)] underline underline-offset-4">View all ({asset.documentCount})</button>} />
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3">{documents.slice(0, 6).map((document) => <Link href={`/documents/${document.id}`} key={document.id} className="rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 p-3 transition hover:border-[var(--gold)]"><FileText size={20} className="text-red-500" /><p className="mt-5 truncate text-sm font-medium">{document.name}</p><p className="mt-1 text-xs text-[var(--muted)]">v{document.version ?? 1} · {documentTypeLabel[document.type]}</p></Link>)}{!documents.length ? <p className="col-span-full py-6 text-sm text-[var(--muted)]">No source documents yet.</p> : null}</div>
          </Card>
        </div>
      ) : null}

      {tab === 'DNA' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Asset intelligence</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Review the decision brief first, then verify the supporting facts against their source excerpts.</p>
            </div>
            <Link href={`/intelligence/dna/${asset.id}`} className="text-sm underline">
              Full explorer
            </Link>
          </div>
          <DnaDecisionTable asset={asset} />
          <FactSummaryTable
            title="Supporting extracted facts"
            facts={(dna?.facts ?? []).map((fact) => ({
              id: fact.id,
              key: fact.key,
              label: fact.label,
              value: fact.value,
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
                          {canWalletAnchor && entry.anchorStatus !== 'BLOCKCHAIN_ANCHORED' ? (
                            <Button
                              className="mt-3"
                              variant="secondary"
                              disabled={walletBusy || recordAnchor.isPending}
                              onClick={() => void anchorDocumentVersionsSequentially(entry.versions)}
                            >
                              {walletBusy || recordAnchor.isPending
                                ? 'Preparing MetaMask…'
                                : entry.versionCount > 1
                                  ? `Anchor pending versions through v${entry.currentVersion}`
                                  : `Anchor v${entry.currentVersion} on ${network?.chainName ?? selectedBlockchainNetwork().chainName}`}
                            </Button>
                          ) : null}
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
          {!bankerOnly ? <Card className="p-6">
            <h2 className="text-lg font-semibold">Upload and anchor</h2>
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
                    ? canWalletAnchor && liveDocumentAnchoringReady
                      ? `Upload, sign, and anchor on ${network?.chainName ?? selectedBlockchainNetwork().chainName}`
                      : 'Upload document'
                    : canWalletAnchor && liveDocumentAnchoringReady
                      ? `Add document and anchor on ${network?.chainName ?? selectedBlockchainNetwork().chainName}`
                      : 'Add document'}
              </Button>
              <p className="text-xs leading-5 text-[var(--muted)]">
                Upload a PDF or DOCX to extract text automatically. The file is stored in the asset folder for
                its category, matching filenames create a new version instead of replacing older ones, and org
                admins can sign a real {network?.chainName ?? selectedBlockchainNetwork().chainName} anchor transaction only when live document anchoring is configured.
              </p>
              {walletMessage ? <p className="text-xs text-[var(--muted)]">{walletMessage}</p> : null}
              {anchorError ? <p role="alert" className="text-xs text-[var(--danger)]">{anchorError}</p> : null}
            </form>
          </Card> : <Card className="p-6"><h2 className="text-lg font-semibold">Credit-desk access</h2><p className="mt-2 text-sm text-[var(--muted)]">Document evidence is read-only for the credit desk. Listers manage uploads and provenance records.</p></Card>}
        </div>
      ) : null}

      {tab === 'Ownership' && !bankerOnly ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Ownership register</p>
                <h2 className="mt-1 text-lg font-semibold">Allocation</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Edit the full allocation, then save it as one validated record.</p>
              </div>
              <Badge tone={Math.abs(ownershipDraft.reduce((sum, item) => sum + Number(item.percentage || 0), 0) - 100) < 0.001 ? 'ok' : 'warn'}>
                {ownershipDraft.reduce((sum, item) => sum + Number(item.percentage || 0), 0).toFixed(2)}% allocated
              </Badge>
            </div>
            <div className="mt-5 space-y-3">
              {ownershipDraft.map((item, index) => (
                <div key={index} className="rounded-xl border border-[var(--line)] bg-white/50 p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto] sm:items-end">
                    <Field label="Holder"><Input value={item.holderName} onChange={(event) => setOwnershipDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, holderName: event.target.value } : row))} /></Field>
                    <Field label="Interest"><Select value={item.ownershipType} onChange={(event) => setOwnershipDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ownershipType: event.target.value as OwnershipType } : row))}><option value="LEGAL">Legal</option><option value="BENEFICIAL">Beneficial</option><option value="ECONOMIC">Economic</option></Select></Field>
                    <Field label="Percentage"><Input type="number" min={0} max={100} value={item.percentage} onChange={(event) => setOwnershipDraft((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, percentage: Number(event.target.value) } : row))} /></Field>
                    <Button type="button" variant="ghost" onClick={() => setOwnershipDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>
                  </div>
                </div>
              ))}
              {!ownershipDraft.length ? <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--muted)]">No holders added. Add at least one holder and allocate exactly 100% before saving.</div> : null}
            </div>
            {saveOwnerships.isError ? <p className="mt-3 text-sm text-[var(--danger)]">Could not save the ownership register. Confirm every holder is valid and the total is exactly 100%.</p> : null}
          </Card>
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Register controls</p>
            <h2 className="mt-1 text-lg font-semibold">Add & save holders</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setOwnershipDraft((current) => [...current, owner]);
                setOwner({ holderName: '', ownershipType: 'LEGAL', percentage: 0, notes: '' });
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
              <Button type="submit" disabled={!owner.holderName.trim()}>Add holder to allocation</Button>
            </form>
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <p className="text-xs leading-5 text-[var(--muted)]">Saving replaces the previous register, records an audit event, and automatically rebuilds Asset DNA with the registered ownership data.</p>
              <Button className="mt-4 w-full" type="button" disabled={saveOwnerships.isPending || !ownershipDraft.length || Math.abs(ownershipDraft.reduce((sum, item) => sum + Number(item.percentage || 0), 0) - 100) >= 0.001} onClick={() => saveOwnerships.mutate()}>
                {saveOwnerships.isPending ? 'Saving & rebuilding DNA…' : 'Save validated ownership register'}
              </Button>
            </div>
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

      {tab === 'Audit' ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] px-6 py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Asset activity</p>
            <h2 className="mt-1 text-lg font-semibold">Audit trail</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">All recorded actions for this asset and its related documents, tokens, collateral, lending, marketplace, trading, and settlement records.</p>
          </div>
          {(auditQuery.data ?? []).length ? (
            <ol className="divide-y divide-[var(--line)]">
              {(auditQuery.data ?? []).map((event) => (
                <li key={event.id} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-medium text-[var(--ink)]">{event.action.replaceAll('.', ' ')}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{event.entityType}{event.actorUserId ? ` · by ${event.actorUserId}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {event.explorerUrl ? (
                      <a href={event.explorerUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--teal)] underline underline-offset-4">See on explorer →</a>
                    ) : null}
                    <time className="text-[var(--muted)]" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-6 py-10 text-sm text-[var(--muted)]">No recorded activity for this asset yet.</p>
          )}
        </Card>
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

function ProfileMetric({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0 bg-[var(--card)] px-4 py-3.5"><p className="text-[11px] font-medium text-[var(--muted)]">{label}</p><p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]" title={value ?? undefined}>{value || '—'}</p></div>;
}

function PanelHeading({ icon, title, subtitle, tag, action }: { icon: ReactNode; title: string; subtitle: string; tag?: string; action?: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#fff1d9] text-[var(--gold)]">{icon}</span><div><h2 className="font-semibold text-[var(--ink)]">{title}</h2><p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p></div></div>{tag ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{tag}</span> : action}</div>;
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
  const { provider, accounts, address: account } = await activeMetaMaskConnection();
  if (!account) throw new Error('Connect MetaMask from the top-right menu before signing an anchor.');
  assertSelectedNetwork(network);
  await ensureDocumentNetwork(provider, network);
  const selected = selectedBlockchainNetwork();
  const browserProvider = walletBrowserProvider(provider, network?.chainId ?? selected.chainId);
  if (!account) throw new Error('MetaMask did not expose an account to CAPROV.');
  const chain = await browserProvider.getNetwork();
  return {
    account,
    accounts,
    chainId: Number(chain.chainId),
    provider,
    browserProvider,
  };
}

function assertSelectedNetwork(network?: DocumentNetworkStatus) {
  if (!network) {
    throw new Error('The selected blockchain network could not be loaded. Try again before signing.');
  }
  const selected = selectedBlockchainNetwork();
  if (network.networkId !== selected.id || network.chainId !== selected.chainId) {
    throw new Error(
      `Network selection changed or is stale. CAPROV selected ${selected.chainName} (chain ID ${selected.chainId}), but the document anchor is configured for ${network.chainName} (chain ID ${network.chainId}). Refresh and try again.`,
    );
  }
}

async function ensureDocumentNetwork(
  provider: WalletProviderLike,
  network?: DocumentNetworkStatus,
) {
  const selected = selectedBlockchainNetwork();
  const chainId = network?.chainId ?? selected.chainId;
  await ensureProviderChain(provider, {
    ...selected,
    chainId,
    chainName: network?.chainName ?? selected.chainName,
    rpcUrl: network?.rpcUrl || selected.rpcUrl,
    blockExplorerUrl: undefined,
  });

  const activeChain = await provider.request({ method: 'eth_chainId' });
  const activeChainId =
    typeof activeChain === 'string' ? Number.parseInt(activeChain, 16) : Number(activeChain);
  if (activeChainId !== chainId) {
    throw new Error(
      `Wallet remains on chain ID ${activeChainId}. ${network?.chainName ?? selected.chainName} (chain ID ${chainId}) is required before an anchor can be submitted.`,
    );
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
