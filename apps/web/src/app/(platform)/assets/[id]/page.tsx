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
  formatDate,
  money,
  riskTone,
} from '@/lib/format';
import type { DocumentRow, HydratedAsset } from '@/lib/types';
import type { DocumentType, OwnershipType } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

const tabs = ['Overview', 'DNA', 'Documents', 'Ownership', 'Valuation & risk'] as const;

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
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

  const assetQuery = useQuery({
    queryKey: ['asset', params.id],
    queryFn: async () => (await api.get<HydratedAsset>(`/assets/${params.id}`)).data,
  });
  const docsQuery = useQuery({
    queryKey: ['documents', params.id],
    queryFn: async () => (await api.get<DocumentRow[]>(`/documents?assetId=${params.id}`)).data,
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
      api.post('/documents', { ...doc, assetId: params.id }),
    onSuccess: async () => {
      setDoc({ name: '', type: 'OTHER', extractedText: '' });
      await api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' });
      await queryClient.invalidateQueries({ queryKey: ['documents', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
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
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    onSuccess: async () => {
      setDoc({ name: '', type: 'OTHER', extractedText: '' });
      setDocFile(null);
      await api.post(`/intelligence/assets/${params.id}/run`, { type: 'FULL_PIPELINE' });
      await queryClient.invalidateQueries({ queryKey: ['documents', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['asset', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const asset = assetQuery.data;
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
              <Row label="Acquired" value={formatDate(asset.acquisitionDate)} />
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
            <h2 className="text-lg font-semibold">Library</h2>
            <div className="mt-4 grid gap-3">
              {(docsQuery.data ?? []).map((document) => (
                <Link
                  key={document.id}
                  href={`/documents/${document.id}`}
                  className="rounded-2xl border border-[var(--line)] px-4 py-3 hover:bg-[var(--paper)]"
                >
                  <p className="font-medium">{document.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {documentTypeLabel[document.type]} · {formatDate(document.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Upload or ingest document</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (docFile) {
                  uploadDoc.mutate();
                  return;
                }
                ingestDoc.mutate();
              }}
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
                  {Object.entries(documentTypeLabel).map(([value, label]) => (
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
              <Button type="submit" disabled={ingestDoc.isPending || uploadDoc.isPending}>
                {ingestDoc.isPending || uploadDoc.isPending
                  ? 'Saving…'
                  : docFile
                    ? 'Upload, extract, and rebuild DNA'
                    : 'Add document'}
              </Button>
              <p className="text-xs leading-5 text-[var(--muted)]">
                Upload a PDF or DOCX to extract text automatically. Linked asset DNA is rebuilt after a successful
                upload so valuation and key fields stay current.
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
