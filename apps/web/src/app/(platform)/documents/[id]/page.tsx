'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { documentTypeLabel, formatDate, formatDateTime } from '@/lib/format';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { DocumentType } from '@caprov/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DocumentDetail {
  id: string;
  assetId?: string;
  name: string;
  originalFilename?: string;
  type: DocumentType;
  status: string;
  createdAt: string;
  version: number;
  isCurrent: boolean;
  versionStatus?: 'CURRENT' | 'PREVIOUS';
  previousDocumentId?: string;
  uploadedBy?: string | null;
  uploadedByUserId?: string;
  storageKey?: string;
  documentHash?: string;
  anchorStatus?: string;
  anchorMode?: 'LIVE' | 'SIMULATED';
  anchorChainId?: number;
  anchorChainName?: string;
  anchorContractAddress?: string;
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
  anchoredAt?: string;
  blockchainReference?: string;
  offChainUri?: string;
  extractedText?: string;
  facts: Array<{ id: string; key: string; value: string; confidence: number; fragment?: string }>;
}

interface DocumentHistoryItem {
  id: string;
  name: string;
  type: DocumentType;
  version: number;
  isCurrent: boolean;
  createdAt: string;
  originalFilename?: string;
  uploadedBy?: string | null;
  uploadedByUserId?: string;
  storageKey?: string;
  versionStatus?: 'CURRENT' | 'PREVIOUS';
  status: string;
  anchorStatus?: string;
  anchorMode?: 'LIVE' | 'SIMULATED';
  anchorChainName?: string;
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
  documentHash?: string;
}

interface DocumentVerifyResult {
  documentId: string;
  assetId?: string;
  documentType: DocumentType;
  version: number;
  isCurrent: boolean;
  offChainUri?: string;
  storageKey: string;
  anchorStatus?: string;
  anchorMode?: 'LIVE' | 'SIMULATED';
  transactionHash?: string;
  explorerUrl?: string;
  blockchainReference?: string;
  recalculatedHash?: string;
  storedHash?: string;
  onChainHash?: string;
  effectiveAnchorStatus?: string;
  effectiveAnchorMode?: 'LIVE' | 'SIMULATED';
  transactionRecorded?: boolean;
  anchoredAt?: string;
  matchesStored: boolean;
  matchesOnChain: boolean;
  authentic: boolean;
  history: DocumentHistoryItem[];
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['document', params.id],
    queryFn: async () => (await api.get<DocumentDetail>(`/documents/${params.id}`)).data,
  });
  const historyQuery = useQuery({
    queryKey: ['document-history', params.id],
    queryFn: async () => (await api.get<DocumentHistoryItem[]>(`/documents/${params.id}/history`)).data,
  });
  const verifyQuery = useQuery({
    queryKey: ['document-verify', params.id],
    queryFn: async () => (await api.get<DocumentVerifyResult>(`/documents/${params.id}/verify`)).data,
  });
  const document = query.data;
  if (!document) {
    return <p className="text-sm text-[var(--muted)]">Loading document…</p>;
  }
  const history = historyQuery.data ?? [];
  const verify = verifyQuery.data;
  const effectiveAnchorStatus =
    verify?.effectiveAnchorStatus ?? document.anchorStatus;
  const effectiveAnchorMode =
    verify?.effectiveAnchorMode ?? document.anchorMode;
  const transactionId = verify?.transactionHash ?? document.anchorTxHash;
  const explorerUrl =
    effectiveAnchorMode === 'LIVE'
      ? sepoliaTxExplorerUrl(transactionId) ??
        sepoliaTxExplorerUrl(verify?.explorerUrl) ??
        sepoliaTxExplorerUrl(document.anchorExplorerUrl)
      : undefined;
  const anchoredAt = verify?.anchoredAt ?? document.anchoredAt;
  const transactionDisplay =
    transactionId ??
    (effectiveAnchorStatus === 'PENDING' ? 'Pending Sepolia anchor' : undefined);
  const anchoredAtDisplay =
    anchoredAt
      ? formatDateTime(anchoredAt)
      : effectiveAnchorStatus === 'PENDING'
        ? 'Awaiting confirmation'
        : undefined;
  const verificationTone = verify
    ? verify.authentic
      ? 'ok'
      : effectiveAnchorStatus === 'PENDING'
        ? 'muted'
        : verify.matchesStored || verify.matchesOnChain
        ? 'warn'
        : 'danger'
    : 'muted';
  const verificationLabel = verify
    ? verify.authentic
      ? 'Verified'
      : effectiveAnchorStatus === 'PENDING'
        ? 'Pending anchor'
        : verify.matchesStored || verify.matchesOnChain
          ? 'Partial match'
          : 'Mismatch'
    : 'Checking';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Document</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{document.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{documentTypeLabel[document.type]}</Badge>
          <Badge tone={document.status === 'READY' ? 'ok' : 'warn'}>{document.status}</Badge>
          <Badge tone={document.isCurrent ? 'ink' : 'muted'}>
            {document.isCurrent ? `Current v${document.version}` : `Version ${document.version}`}
          </Badge>
          {document.anchorStatus ? (
            <Badge
              tone={
                effectiveAnchorStatus === 'BLOCKCHAIN_ANCHORED'
                  ? 'ok'
                  : effectiveAnchorStatus === 'SIMULATED'
                    ? 'warn'
                    : effectiveAnchorStatus === 'ANCHOR_FAILED'
                      ? 'danger'
                      : 'muted'
              }
            >
              {effectiveAnchorStatus?.replaceAll('_', ' ') ?? '—'}
            </Badge>
          ) : null}
          {document.assetId ? (
            <Link href={`/assets/${document.assetId}`} className="text-sm underline">
              Open linked asset
            </Link>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Version</p>
          <p className="mt-3 text-2xl font-semibold">v{document.version}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {document.versionStatus === 'CURRENT' ? 'Current version' : 'Previous version'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Uploaded by</p>
          <p className="mt-3 text-2xl font-semibold">{document.uploadedBy ?? '—'}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{document.uploadedByUserId ?? 'Uploader id not recorded'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Uploaded at</p>
          <p className="mt-3 text-2xl font-semibold">{formatDate(document.createdAt)}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatDateTime(document.createdAt)}
          </p>
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Blockchain details</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Anchor status, transaction id, and the explorer link for this document version.
            </p>
          </div>
          <Badge tone={verificationTone}>{verificationLabel}</Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <MetadataRow label="Anchor status" value={effectiveAnchorStatus?.replaceAll('_', ' ')} />
          <MetadataRow label="Anchor mode" value={effectiveAnchorMode} />
          <MetadataRow label="Transaction id" value={transactionDisplay} />
          <MetadataRow label="Anchored at" value={anchoredAtDisplay} />
          <MetadataRow label="Document hash" value={verify?.storedHash ?? document.documentHash} />
          <MetadataRow label="Blockchain reference" value={verify?.blockchainReference ?? document.blockchainReference} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-[var(--line)] px-4 py-2 text-sm font-medium underline"
            >
              View on transaction explorer
            </a>
          ) : null}
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Document details</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <MetadataRow label="Original filename" value={document.originalFilename} />
          <MetadataRow label="Supersedes" value={document.previousDocumentId} />
          <MetadataRow label="Contract" value={document.anchorContractAddress} />
          <MetadataRow label="Storage location" value={document.storageKey} />
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Version history</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="pb-3 pr-4 font-medium">Version</th>
                <th className="pb-3 pr-4 font-medium">Filename</th>
                <th className="pb-3 pr-4 font-medium">Anchor</th>
                <th className="pb-3 pr-4 font-medium">Transaction</th>
                <th className="pb-3 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-t border-[var(--line)]/80 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">v{item.version}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {item.isCurrent ? 'Current version' : 'Previous version'}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-[var(--muted)]">{item.originalFilename ?? item.name}</td>
                  <td className="py-3 pr-4">
                    <div>{item.anchorStatus?.replaceAll('_', ' ') ?? '—'}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {item.anchorChainName ?? item.anchorMode ?? 'No chain data'}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {item.anchorTxHash ? (
                      <div className="space-y-1">
                        <div className="break-all font-mono text-xs">{item.anchorTxHash}</div>
                        {item.anchorMode === 'LIVE' &&
                        sepoliaTxExplorerUrl(item.anchorTxHash ?? item.anchorExplorerUrl) ? (
                          <a
                            href={sepoliaTxExplorerUrl(item.anchorTxHash ?? item.anchorExplorerUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline"
                          >
                            Open explorer
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="py-3">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-all font-mono text-sm">{value ?? '—'}</p>
    </div>
  );
}
