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
import { useState } from 'react';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    assetId: '',
    extractedText: '',
  });
  const [file, setFile] = useState<File | null>(null);
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
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Upload source documents"
        description="Add the files behind an asset. CAPROV reads them, extracts key details, and makes them easier to review."
      />
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
                <th className="px-4 py-3.5 font-medium sm:px-6">Ingested</th>
              </tr>
            </thead>
            <tbody>
              {(docsQuery.data ?? []).map((document) => (
                <tr key={document.id} className="border-t border-[var(--line)]/80">
                  <td className="px-4 py-4 sm:px-6">
                    <Link href={`/documents/${document.id}`} className="font-medium text-[var(--ink)] hover:underline">
                      {document.name}
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <Badge>{documentTypeLabel[document.type]}</Badge>
                  </td>
                  <td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(document.createdAt)}</td>
                </tr>
              ))}
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
