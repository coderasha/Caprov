'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  formatDate,
  formatDateTime,
} from '@/lib/format';
import type { AssetDocumentsTree, HydratedAsset } from '@/lib/types';

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

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'OTHER' as DocumentType,
    assetId: '',
    extractedText: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');

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

  const ingest = useMutation({
    mutationFn: async () =>
      api.post('/documents', {
        name: form.name,
        type: form.type,
        assetId: form.assetId,
        extractedText: form.extractedText,
      }),
    onSuccess: async () => {
      const assetId = form.assetId;
      setForm((current) => ({ ...current, name: '', type: 'OTHER', extractedText: '' }));
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['documents-tree', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
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
      body.append('assetId', form.assetId);
      if (form.extractedText.trim()) {
        body.append('extractedText', form.extractedText);
      }
      return api.post('/documents/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: async () => {
      const assetId = form.assetId;
      setForm((current) => ({ ...current, name: '', type: 'OTHER', extractedText: '' }));
      setFile(null);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['documents-tree', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['asset', assetId] });
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  const tree = assetTreeQuery.data;
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
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Upload a document</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError('');
              if (!form.assetId) {
                setFormError('Select the asset this document belongs to.');
                return;
              }
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
            <Button type="submit" disabled={ingest.isPending || upload.isPending}>
              {upload.isPending || ingest.isPending ? 'Saving…' : file ? 'Upload new version' : 'Ingest new version'}
            </Button>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Uploading the same filename into the same asset folder and category creates a new version and keeps
              all previous versions available in history.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
