'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { documentTypeLabel, formatDate } from '@/lib/format';
import type { DocumentRow, HydratedAsset } from '@/lib/types';
import type { DocumentType } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    assetId: '',
    extractedText: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');
  const docsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await api.get<DocumentRow[]>('/documents')).data,
  });
  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const ingest = useMutation({
    mutationFn: async () =>
      api.post('/documents', {
        name: form.name,
        type: form.type,
        assetId: form.assetId || undefined,
        extractedText: form.extractedText,
      }),
    onSuccess: async () => {
      setForm({ name: '', type: 'OTHER', assetId: '', extractedText: '' });
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      if (file) {
        body.append('file', file);
      }
      body.append('name', form.name || file?.name || 'Untitled document');
      body.append('type', form.type);
      if (form.assetId) {
        body.append('assetId', form.assetId);
      }
      if (form.extractedText.trim()) {
        body.append('extractedText', form.extractedText);
      }
      return api.post('/documents/upload', body, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    onSuccess: async () => {
      setForm({ name: '', type: 'OTHER', assetId: '', extractedText: '' });
      setFile(null);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
  const documents = docsQuery.data ?? [];
  const assetNameById = useMemo(
    () => Object.fromEntries((assetsQuery.data ?? []).map((asset) => [asset.id, asset.name])),
    [assetsQuery.data],
  );
  const assets = assetsQuery.data ?? [];
  const linkedDocuments = documents.filter((document) => document.assetId).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Upload source documents"
        description="Add the files behind an asset. CAPROV reads them, extracts key details, and makes them easier to review."
        actions={
          <Link href="/assets/new">
            <Button variant="secondary">Create asset first</Button>
          </Link>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Documents', value: String(documents.length), hint: 'Files and text ingested' },
          { label: 'Linked to assets', value: String(linkedDocuments), hint: 'Documents already tied to an asset' },
          { label: 'Assets ready', value: String(assets.length), hint: 'Assets available for document linking' },
          { label: 'Unlinked docs', value: String(documents.length - linkedDocuments), hint: 'May need operator cleanup' },
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
            Create an asset before you start uploading
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            The cleanest workflow is asset first, then documents. That way every uploaded file is connected to the
            right record, and Asset DNA, valuation, risk, and downstream workflows stay organized.
          </p>
          <div className="mt-4">
            <Link href="/assets/new">
              <Button>Create asset</Button>
            </Link>
          </div>
        </Card>
      ) : null}
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            '1. Choose the asset this document belongs to.',
            '2. Upload the PDF or DOCX file, or paste text directly.',
            '3. Open the saved document to review the extracted details table.',
          ].map((step) => (
            <p key={step} className="text-sm leading-6 text-[var(--muted)]">
              {step}
            </p>
          ))}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <div className="caprov-scroll">
          <table className="caprov-table w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3.5 font-medium sm:px-6">Document</th>
                <th className="px-3 py-3.5 font-medium">Type</th>
                <th className="px-3 py-3.5 font-medium">Asset</th>
                <th className="px-4 py-3.5 font-medium sm:px-6">Ingested</th>
              </tr>
            </thead>
            <tbody>
              {documents.length ? (
                documents.map((document) => (
                  <tr key={document.id} className="border-t border-[var(--line)]/80">
                    <td className="px-4 py-4 sm:px-6">
                      <Link href={`/documents/${document.id}`} className="font-medium text-[var(--ink)] hover:underline">
                        {document.name}
                      </Link>
                    </td>
                    <td className="px-3 py-4">
                      <Badge>{documentTypeLabel[document.type]}</Badge>
                    </td>
                    <td className="px-3 py-4 text-[var(--muted)]">
                      {document.assetId ? assetNameById[document.assetId] ?? 'Linked asset' : 'Unassigned'}
                    </td>
                    <td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(document.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-[var(--line)]/80">
                  <td colSpan={4} className="px-6 py-8">
                    <p className="text-sm font-medium text-[var(--ink)]">No documents yet</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Upload the first source file to kick off extraction and downstream Asset DNA review.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Add a document</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError('');
              if (!file && !form.extractedText.trim()) {
                setFormError('Add a file or paste text so the document has something to ingest.');
                return;
              }
              if (file) {
                upload.mutate();
                return;
              }
              ingest.mutate();
            }}
          >
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
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DocumentType })}>
                {Object.entries(documentTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link to asset">
              <Select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
                <option value="">Unassigned</option>
                {(assetsQuery.data ?? []).map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
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
            <Button type="submit" disabled={ingest.isPending || upload.isPending}>
              {upload.isPending || ingest.isPending
                ? 'Saving…'
                : file
                  ? 'Upload and extract'
                  : 'Ingest'}
            </Button>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Supports PDF, DOCX, and plain-text files. After upload, open the document to see the extracted details in a simple table.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
