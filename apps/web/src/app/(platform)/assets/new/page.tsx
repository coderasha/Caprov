'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { readFileAsDataUrl, readFilesAsDataUrls } from '@/lib/files';
import { assetClassLabel } from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import type { AssetClass, AssetStatus, CurrencyCode } from '@caprov/types';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const classes = Object.keys(assetClassLabel) as AssetClass[];

export default function NewAssetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    assetClass: 'REAL_ESTATE' as AssetClass,
    status: 'DRAFT' as AssetStatus,
    currency: 'USD' as CurrencyCode,
    jurisdiction: '',
    location: '',
    description: '',
    acquisitionDate: '',
    primaryImageUrl: '',
    imageUrls: [] as string[],
    primaryImageName: '',
    galleryImageNames: [] as string[],
  });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const imageUrls = Array.from(new Set([form.primaryImageUrl, ...form.imageUrls].filter(Boolean)));
      const response = await api.post<HydratedAsset>('/assets', {
        ...form,
        imageUrls,
      });
      router.push(`/assets/${response.data.id}`);
    } catch {
      setError('Could not create the asset. Check the fields and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Assets</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">New asset</h1>
      </div>
      <Card className="p-6">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class">
              <Select
                value={form.assetClass}
                onChange={(e) => setForm({ ...form, assetClass: e.target.value as AssetClass })}
              >
                {classes.map((value) => (
                  <option key={value} value={value}>
                    {assetClassLabel[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="UNDER_REVIEW">Under review</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CurrencyCode })}
              >
                {['USD', 'EUR', 'GBP', 'SGD', 'INR'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Acquisition date">
              <Input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
              />
            </Field>
            <Field label="Jurisdiction">
              <Input value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Primary image">
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setForm({ ...form, primaryImageUrl: '', primaryImageName: '' });
                  return;
                }
                const primaryImageUrl = await readFileAsDataUrl(file);
                setForm({ ...form, primaryImageUrl, primaryImageName: file.name });
              }}
            />
            {form.primaryImageName ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Selected: {form.primaryImageName}</p>
            ) : null}
            {form.primaryImageUrl ? (
              <Image
                src={form.primaryImageUrl}
                alt="Primary asset preview"
                width={640}
                height={288}
                className="mt-3 h-36 w-full rounded-2xl object-cover"
                unoptimized
              />
            ) : null}
          </Field>
          <Field label="Gallery images">
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={async (e) => {
                const files = e.target.files;
                if (!files?.length) {
                  setForm({ ...form, imageUrls: [], galleryImageNames: [] });
                  return;
                }
                const imageUrls = await readFilesAsDataUrls(files);
                setForm({
                  ...form,
                  imageUrls,
                  galleryImageNames: Array.from(files).map((file) => file.name),
                });
              }}
            />
            {form.galleryImageNames.length > 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Selected: {form.galleryImageNames.join(', ')}
              </p>
            ) : null}
          </Field>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create asset'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
