'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FactSummaryTable } from '@/components/intelligence/fact-summary-table';
import { api } from '@/lib/api';
import { documentTypeLabel, formatDate } from '@/lib/format';
import type { DocumentType } from '@caprov/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DocumentDetail {
  id: string;
  assetId?: string;
  name: string;
  type: DocumentType;
  status: string;
  createdAt: string;
  version: number;
  isCurrent: boolean;
  previousDocumentId?: string;
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
  const verificationTone = verify
    ? verify.authentic
      ? 'ok'
      : verify.matchesStored || verify.matchesOnChain
        ? 'warn'
        : 'danger'
    : 'muted';

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
                document.anchorStatus === 'BLOCKCHAIN_ANCHORED'
                  ? 'ok'
                  : document.anchorStatus === 'SIMULATED'
                    ? 'warn'
                    : document.anchorStatus === 'ANCHOR_FAILED'
                      ? 'danger'
                      : 'muted'
              }
            >
              {document.anchorStatus.replaceAll('_', ' ')}
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
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Current version</p>
          <p className="mt-3 text-2xl font-semibold">v{document.version}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {document.previousDocumentId ? `Supersedes ${document.previousDocumentId}` : 'First version in this lineage'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Anchor mode</p>
          <p className="mt-3 text-2xl font-semibold">{document.anchorMode ?? '—'}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{document.anchorChainName ?? 'Not linked to chain'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Anchored at</p>
          <p className="mt-3 text-2xl font-semibold">{formatDate(document.anchoredAt ?? document.createdAt)}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {document.anchoredAt ? 'Anchor timestamp recorded' : 'No blockchain anchor timestamp yet'}
          </p>
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Verification and blockchain details</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              CAPROV stores the version hash, transaction id, and verification result for this document lineage.
            </p>
          </div>
          <Badge tone={verificationTone}>
            {verify
              ? verify.authentic
                ? 'Verified'
                : verify.matchesStored || verify.matchesOnChain
                  ? 'Partial match'
                  : 'Mismatch'
              : 'Checking'}
          </Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <MetadataRow label="Blockchain reference" value={verify?.blockchainReference ?? document.blockchainReference} />
          <MetadataRow label="Transaction id" value={verify?.transactionHash ?? document.anchorTxHash} />
          <MetadataRow label="Stored hash" value={verify?.storedHash ?? document.documentHash} />
          <MetadataRow label="Recalculated hash" value={verify?.recalculatedHash} />
          <MetadataRow label="On-chain hash" value={verify?.onChainHash} />
          <MetadataRow label="Contract" value={document.anchorContractAddress} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <StatusChip label="Stored hash matches file" ok={Boolean(verify?.matchesStored)} />
          <StatusChip label="On-chain hash matches file" ok={Boolean(verify?.matchesOnChain)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {document.anchorExplorerUrl ? (
            <a href={document.anchorExplorerUrl} target="_blank" rel="noreferrer" className="underline">
              View transaction on explorer
            </a>
          ) : null}
          {document.offChainUri ? <span className="text-[var(--muted)]">Off-chain URI: {document.offChainUri}</span> : null}
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Version history</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Each upload for the same asset and document type creates a new immutable version.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="pb-3 pr-4 font-medium">Version</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Anchor</th>
                <th className="pb-3 pr-4 font-medium">Transaction</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-t border-[var(--line)]/80 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">v{item.version}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {item.isCurrent ? 'Current version' : `Document ${item.id}`}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={item.isCurrent ? 'ink' : 'muted'}>
                      {item.isCurrent ? 'Current' : 'Archived'}
                    </Badge>
                  </td>
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
                        {item.anchorExplorerUrl ? (
                          <a
                            href={item.anchorExplorerUrl}
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
                  <td className="py-3">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Extracted text</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">Ingested {formatDate(document.createdAt)}</p>
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-[var(--paper)] p-4 text-sm leading-7">
          {document.extractedText || 'No text extracted for this file yet.'}
        </pre>
      </Card>
      <FactSummaryTable
        title="Extracted details"
        facts={document.facts}
        emptyMessage="No structured details were extracted yet. If this document is linked to an asset, rebuild DNA for a fuller asset-level summary."
      />
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

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return <Badge tone={ok ? 'ok' : 'warn'}>{label}</Badge>;
}
