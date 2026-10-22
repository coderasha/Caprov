'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { distinctOptions, indiaAddressDirectory, indiaStates } from '@/lib/india-address-directory';
import { readFileAsDataUrl, readFilesAsDataUrls } from '@/lib/files';
import type { HydratedAsset } from '@/lib/types';
import type { AssetAddress } from '@caprov/types';
import { assetSubcategories, type AssetClass, type AssetStatus, type CurrencyCode } from '@caprov/types';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

const classes = [
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'PLANT_AND_MACHINERY', label: 'Plant & Machinery' },
  { value: 'PRIVATE_EQUITY', label: 'Private Equity' },
] as const satisfies ReadonlyArray<{ value: AssetClass; label: string }>;

const initialAddress: AssetAddress = {
  countryCode: 'IN',
  countryName: 'India',
  source: 'MANUAL',
};

export default function NewAssetPage() {
  const router = useRouter();
  const roles = useAuthStore((state) => state.roles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    assetClass: 'REAL_ESTATE' as AssetClass,
    assetSubcategory: '',
    address: initialAddress,
    status: 'DRAFT' as AssetStatus,
    currency: 'USD' as CurrencyCode,
    description: '',
    creationDate: '',
    primaryImageUrl: '',
    imageUrls: [] as string[],
    primaryImageName: '',
    galleryImageNames: [] as string[],
  });

  const canCreateAssets = roles.includes('ORG_ADMIN') || roles.includes('PLATFORM_ADMIN');

  if (!canCreateAssets) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Assets</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Asset creation is restricted</h1>
        </div>
        <Card className="p-6">
          <p className="text-sm leading-6 text-[var(--muted)]">
            Only organization administrators can create assets. Buyers review listings and place buy interest instead.
          </p>
          <Button className="mt-5" onClick={() => router.push('/assets')}>View assets</Button>
        </Card>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const imageUrls = Array.from(new Set([form.primaryImageUrl, ...form.imageUrls].filter(Boolean)));
      const response = await api.post<HydratedAsset>('/assets', {
        name: form.name,
        assetClass: form.assetClass,
        assetSubcategory: form.assetSubcategory,
        status: form.status,
        currency: form.currency,
        address: form.address,
        description: form.description || undefined,
        creationDate: form.creationDate || undefined,
        primaryImageUrl: form.primaryImageUrl || undefined,
        imageUrls,
      });
      router.push(`/assets/${response.data.id}`);
    } catch {
      setError('Could not create the asset. Check the fields and try again.');
    } finally {
      setLoading(false);
    }
  }

  const addressMatches = useMemo(
    () => indiaAddressDirectory.filter((item) =>
      (!form.address.stateCode || item.stateCode === form.address.stateCode) &&
      (!form.address.districtName || item.districtName === form.address.districtName) &&
      (!form.address.subDistrictName || item.subDistrictName === form.address.subDistrictName) &&
      (!form.address.settlementName || item.settlementName === form.address.settlementName),
    ),
    [form.address],
  );
  const setAddress = (patch: Partial<typeof form.address>) =>
    setForm({ ...form, address: { ...form.address, source: 'MANUAL', ...patch } });
  const subDistrictLabel = addressMatches[0]?.subDistrictLabel ?? 'Sub-district';

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
            <Field label="Asset class">
              <Select
                value={form.assetClass}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assetClass: e.target.value as AssetClass,
                    assetSubcategory: '',
                  })
                }
              >
                {classes.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory">
              <Select
                value={form.assetSubcategory}
                onChange={(e) => setForm({ ...form, assetSubcategory: e.target.value })}
                required
              >
                <option value="" disabled>Select a subcategory</option>
                {assetSubcategories[form.assetClass].map((subcategory) => (
                  <option key={subcategory} value={subcategory}>{subcategory}</option>
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
            <Field label="Creation date">
              <Input
                type="date"
                value={form.creationDate}
                onChange={(e) => setForm({ ...form, creationDate: e.target.value })}
              />
            </Field>
          </div>
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/40 p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Asset address</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">PIN lookup narrows the address when a matching postal record is available. Every field remains editable.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country">
                <Select value={form.address.countryCode} onChange={(e) => setAddress({ countryCode: e.target.value, countryName: e.target.value === 'IN' ? 'India' : e.target.value })}>
                  <option value="IN">India</option>
                </Select>
              </Field>
              <Field label="PIN Code">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit PIN"
                  value={form.address.pinCode ?? ''}
                  onChange={(e) => {
                    const pinCode = e.target.value.replace(/\D/g, '').slice(0, 6);
                    const matched = pinCode.length === 6 ? indiaAddressDirectory.find((item) => item.pinCode === pinCode) : undefined;
                    setAddress(matched ? { ...matched, pinCode, source: 'INDIA_POST' } : { pinCode });
                  }}
                />
              </Field>
              <Field label="State / Union Territory">
                <Select value={form.address.stateCode ?? ''} onChange={(e) => {
                  const [stateCode, stateName] = indiaStates.find(([code]) => code === e.target.value) ?? ['', ''];
                  setAddress({ stateCode, stateName, districtCode: '', districtName: '', subDistrictCode: '', subDistrictName: '', settlementName: '', locality: '' });
                }}>
                  <option value="">Select state / union territory</option>
                  {indiaStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </Select>
              </Field>
              <Field label="District">
                <Input list="asset-districts" value={form.address.districtName ?? ''} placeholder="Select or enter district" onChange={(e) => setAddress({ districtName: e.target.value, subDistrictCode: '', subDistrictName: '', settlementName: '', locality: '' })} />
                <datalist id="asset-districts">{distinctOptions(addressMatches, 'districtName').map((value) => <option key={value} value={value} />)}</datalist>
              </Field>
              <Field label={subDistrictLabel}>
                <Input list="asset-subdistricts" value={form.address.subDistrictName ?? ''} placeholder={`Select or enter ${subDistrictLabel.toLowerCase()}`} onChange={(e) => setAddress({ subDistrictName: e.target.value, settlementName: '', locality: '' })} />
                <datalist id="asset-subdistricts">{distinctOptions(addressMatches, 'subDistrictName').map((value) => <option key={value} value={value} />)}</datalist>
              </Field>
              <Field label="Village / Town / City">
                <Input list="asset-settlements" value={form.address.settlementName ?? ''} placeholder="Select or enter settlement" onChange={(e) => setAddress({ settlementName: e.target.value, locality: '' })} />
                <datalist id="asset-settlements">{distinctOptions(addressMatches, 'settlementName').map((value) => <option key={value} value={value} />)}</datalist>
              </Field>
              <Field label="Locality / Area / Ward">
                <Input list="asset-localities" value={form.address.locality ?? ''} placeholder="Select or enter locality" onChange={(e) => setAddress({ locality: e.target.value })} />
                <datalist id="asset-localities">{distinctOptions(addressMatches, 'locality').map((value) => <option key={value} value={value} />)}</datalist>
              </Field>
              <Field label="Post office">
                <Input value={form.address.postOffice ?? ''} onChange={(e) => setAddress({ postOffice: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Property / Site Address">
                <Textarea rows={3} value={form.address.propertyAddress ?? ''} placeholder="Building, plot, street, road, landmark" onChange={(e) => setAddress({ propertyAddress: e.target.value })} />
              </Field>
            </div>
          </section>
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
