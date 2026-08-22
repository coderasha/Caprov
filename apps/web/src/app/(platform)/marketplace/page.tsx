'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { readFileAsDataUrl } from '@/lib/files';
import { money } from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';

interface ListingRow {
  id: string;
  title: string;
  status: string;
  offeringType: 'SALE' | 'LEASE';
  summary?: string;
  imageUrl?: string;
  askPrice: number;
  currency: string;
  quantityBps: number;
  remainingBps: number;
  leaseRate?: number;
  leaseTermMonths?: number;
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  token?: {
    id: string;
    status: string;
    txHash?: string;
    explorerUrl?: string;
    mode?: 'LIVE' | 'SIMULATED';
  } | null;
  asset?: {
    id: string;
    name: string;
    assetClass: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
  valuation?: { payload: { amount: number; currency: string } } | null;
  risk?: { payload: { rating: string } } | null;
}

const placeholderImage = '/file.svg';

export default function MarketplacePage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const canManageListings =
    roles.includes('ORG_ADMIN') || roles.includes('ANALYST') || roles.includes('PLATFORM_ADMIN');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    assetId: '',
    title: '',
    summary: '',
    imageUrl: '',
    imageName: '',
    offeringType: 'SALE' as 'SALE' | 'LEASE',
    quantityBps: '2500',
    askPrice: '',
    leaseRate: '',
    leaseTermMonths: '36',
    tokenizeOnCreate: true,
    tokenSupply: '1000000',
    recipientAddress: '',
  });

  const listings = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => (await api.get<{ listings: ListingRow[] }>('/marketplace')).data.listings,
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });

  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === form.assetId) ?? null;
  const selectedAssetValuation = selectedAsset?.latestValuation?.payload.amount;
  const effectiveAskPrice =
    form.askPrice ||
    (form.offeringType === 'SALE' && selectedAssetValuation ? String(selectedAssetValuation) : '');
  const requiresManualAskPrice =
    form.offeringType === 'SALE' && !selectedAsset?.latestValuation?.payload.amount && !effectiveAskPrice;
  const saleListings = useMemo(
    () => (listings.data ?? []).filter((listing) => listing.offeringType === 'SALE'),
    [listings.data],
  );
  const leaseListings = useMemo(
    () => (listings.data ?? []).filter((listing) => listing.offeringType === 'LEASE'),
    [listings.data],
  );

  const create = useMutation({
    mutationFn: async () =>
      api.post('/marketplace/listings', {
        assetId: form.assetId,
        title: form.title || undefined,
        summary: form.summary || undefined,
        imageUrl: form.imageUrl || undefined,
        offeringType: form.offeringType,
        quantityBps: form.offeringType === 'SALE' ? Number(form.quantityBps) : undefined,
        askPrice: effectiveAskPrice ? Number(effectiveAskPrice) : undefined,
        leaseRate: form.offeringType === 'LEASE' && form.leaseRate ? Number(form.leaseRate) : undefined,
        leaseTermMonths:
          form.offeringType === 'LEASE' && form.leaseTermMonths
            ? Number(form.leaseTermMonths)
            : undefined,
        tokenizeOnCreate: form.offeringType === 'SALE' ? form.tokenizeOnCreate : false,
        tokenSupply:
          form.offeringType === 'SALE' && form.tokenizeOnCreate ? Number(form.tokenSupply) : undefined,
        recipientAddress: form.recipientAddress || undefined,
      }),
    onSuccess: async () => {
      setForm({
        assetId: '',
        title: '',
        summary: '',
        imageUrl: '',
        imageName: '',
        offeringType: 'SALE',
        quantityBps: '2500',
        askPrice: '',
        leaseRate: '',
        leaseTermMonths: '36',
        tokenizeOnCreate: true,
        tokenSupply: '1000000',
        recipientAddress: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      await queryClient.invalidateQueries({ queryKey: ['tokenization'] });
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          setFormError('Your account does not have permission to publish marketplace listings.');
          return;
        }
        const message = error.response?.data?.message;
        if (typeof message === 'string' && message.trim()) {
          setFormError(message);
          return;
        }
      }
      setFormError('Could not publish the listing. Please check the form and try again.');
    },
  });

  const close = useMutation({
    mutationFn: async (id: string) => api.post(`/marketplace/listings/${id}/close`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['marketplace'] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Marketplace"
        title="Asset marketplace"
        description="Org admins can publish assets for sale or lease, optionally tokenize sale listings, and present them to buyers across the workspace."
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">For sale</h2>
              <Link href="/trading" className="text-sm underline">
                Open buyer desk
              </Link>
            </div>
            <div className="grid gap-4">
              {saleListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  canManageListings={canManageListings}
                  onClose={() => close.mutate(listing.id)}
                  closePending={close.isPending}
                />
              ))}
              {saleListings.length === 0 ? (
                <EmptyState
                  title="No sale listings yet"
                  body="Once an org admin lists an asset for sale, buyers will see it here and can move to the trading desk to purchase interest."
                />
              ) : null}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">For lease</h2>
            <div className="grid gap-4">
              {leaseListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  canManageListings={canManageListings}
                  onClose={() => close.mutate(listing.id)}
                  closePending={close.isPending}
                />
              ))}
              {leaseListings.length === 0 ? (
                <EmptyState
                  title="No lease listings yet"
                  body="Lease opportunities published by the org admin will appear here with lease rate and term."
                />
              ) : null}
            </div>
          </section>
        </div>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Listing publisher</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Publish assets into the marketplace with imagery, pricing, and optional tokenization.
          </p>

          {!canManageListings ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)]">
              Only organization admins, analysts, and platform admins can create or close listings. You can still browse the marketplace and buy sale listings from the trading desk.
            </div>
          ) : (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setFormError('');
                if (requiresManualAskPrice) {
                  setFormError('Enter an ask price before listing an asset that has no valuation mark yet.');
                  return;
                }
                create.mutate();
              }}
            >
              <Field label="Asset">
                <Select
                  value={form.assetId}
                  onChange={(e) => setForm((current) => ({ ...current, assetId: e.target.value }))}
                  required
                >
                  <option value="">Select asset</option>
                  {(assets.data ?? []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedAsset ? (
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/70 p-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={selectedAsset.primaryImageUrl || selectedAsset.imageUrls?.[0] || placeholderImage}
                      alt={selectedAsset.name}
                      width={80}
                      height={64}
                      className="h-16 w-20 rounded-xl object-cover"
                      unoptimized
                    />
                    <div>
                      <p className="text-sm font-medium">{selectedAsset.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {selectedAsset.assetClass.replaceAll('_', ' ')} · {selectedAsset.location || 'Location pending'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <Field label="Listing type">
                <Select
                  value={form.offeringType}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      offeringType: e.target.value as 'SALE' | 'LEASE',
                    }))
                  }
                >
                  <option value="SALE">Sell</option>
                  <option value="LEASE">Lease</option>
                </Select>
              </Field>
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  placeholder="Optional listing title"
                />
              </Field>
              <Field label="Summary">
                <Textarea
                  rows={3}
                  value={form.summary}
                  onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))}
                  placeholder="What should buyers know about this opportunity?"
                />
              </Field>
              <Field label="Listing image">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setForm((current) => ({ ...current, imageUrl: '', imageName: '' }));
                      return;
                    }
                    const imageUrl = await readFileAsDataUrl(file);
                    setForm((current) => ({ ...current, imageUrl, imageName: file.name }));
                  }}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Upload an image, or leave this blank to use the asset image automatically.
                </p>
                {form.imageName ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">Selected: {form.imageName}</p>
                ) : null}
                {form.imageUrl ? (
                  <Image
                    src={form.imageUrl}
                    alt="Listing preview"
                    width={640}
                    height={224}
                    className="mt-3 h-28 w-full rounded-2xl object-cover"
                    unoptimized
                  />
                ) : null}
              </Field>

              {form.offeringType === 'SALE' ? (
                <>
                  <Field label="Ask price">
                    <Input
                      type="number"
                      min="1"
                      value={effectiveAskPrice}
                      onChange={(e) => setForm((current) => ({ ...current, askPrice: e.target.value }))}
                      placeholder={
                        selectedAssetValuation
                          ? 'Defaults to latest valuation'
                          : 'Required when no valuation exists'
                      }
                      required={!selectedAssetValuation}
                    />
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {selectedAssetValuation
                        ? `Pre-filled from latest valuation: ${money(
                            selectedAssetValuation,
                            selectedAsset?.latestValuation?.payload.currency ?? selectedAsset?.currency ?? 'USD',
                          )}`
                        : 'This asset has no valuation mark yet, so you need to enter an ask price manually.'}
                    </p>
                  </Field>
                  <Field label="Interest offered (bps)">
                    <Input
                      type="number"
                      min="1"
                      max="10000"
                      value={form.quantityBps}
                      onChange={(e) => setForm((current) => ({ ...current, quantityBps: e.target.value }))}
                    />
                  </Field>
                  <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.tokenizeOnCreate}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, tokenizeOnCreate: e.target.checked }))
                      }
                    />
                    <span>
                      Tokenize on listing creation
                      <span className="mt-1 block text-[12px] text-[var(--muted)]">
                        This mints tokens on Ethereum Sepolia before publishing the sale listing.
                      </span>
                    </span>
                  </label>
                  {form.tokenizeOnCreate ? (
                    <>
                      <Field label="Token supply">
                        <Input
                          type="number"
                          min="1"
                          value={form.tokenSupply}
                          onChange={(e) => setForm((current) => ({ ...current, tokenSupply: e.target.value }))}
                        />
                      </Field>
                      <Field label="Recipient (optional Sepolia address)">
                        <Input
                          value={form.recipientAddress}
                          onChange={(e) =>
                            setForm((current) => ({ ...current, recipientAddress: e.target.value }))
                          }
                          placeholder="0x..."
                        />
                      </Field>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Field label="Lease rate">
                    <Input
                      type="number"
                      min="1"
                      value={form.leaseRate}
                      onChange={(e) => setForm((current) => ({ ...current, leaseRate: e.target.value }))}
                      placeholder="Monthly or annual lease figure"
                      required
                    />
                  </Field>
                  <Field label="Lease term (months)">
                    <Input
                      type="number"
                      min="1"
                      value={form.leaseTermMonths}
                      onChange={(e) =>
                        setForm((current) => ({ ...current, leaseTermMonths: e.target.value }))
                      }
                    />
                  </Field>
                </>
              )}

              {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}

              <Button type="submit" disabled={create.isPending || !form.assetId}>
                {create.isPending
                  ? form.offeringType === 'SALE'
                    ? 'Publishing sale listing…'
                    : 'Publishing lease listing…'
                  : form.offeringType === 'SALE'
                    ? 'List asset for sale'
                    : 'List asset for lease'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  canManageListings,
  onClose,
  closePending,
}: {
  listing: ListingRow;
  canManageListings: boolean;
  onClose: () => void;
  closePending: boolean;
}) {
  const image = listing.imageUrl || listing.asset?.primaryImageUrl || listing.asset?.imageUrls?.[0] || placeholderImage;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[240px_1fr]">
        <div
          className="min-h-[180px] bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(180deg, rgba(19,18,16,0.08), rgba(19,18,16,0.28)), url(${image})` }}
        />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{listing.title}</h2>
                <Badge>{listing.offeringType}</Badge>
                {listing.tokenizationMode ? <Badge tone="warn">Tokenized · {listing.tokenizationMode}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {listing.asset?.name} · {listing.asset?.assetClass.replaceAll('_', ' ') ?? 'Asset'}
              </p>
            </div>
            <Badge>{listing.status}</Badge>
          </div>

          {listing.summary ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{listing.summary}</p> : null}

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1 text-sm">
              {listing.offeringType === 'SALE' ? (
                <>
                  <p className="font-medium tabular-nums">
                    Ask {money(listing.askPrice, listing.currency)} · {(listing.remainingBps / 100).toFixed(0)}% remaining
                  </p>
                  {listing.risk?.payload.rating ? (
                    <p className="text-[var(--muted)]">Risk {listing.risk.payload.rating}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="font-medium tabular-nums">
                    Lease rate {money(listing.leaseRate ?? listing.askPrice, listing.currency)}
                  </p>
                  <p className="text-[var(--muted)]">
                    {listing.leaseTermMonths ? `${listing.leaseTermMonths} month term` : 'Lease term on request'}
                  </p>
                </>
              )}
              {listing.token?.explorerUrl ? (
                <a
                  href={listing.token.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[12px] underline"
                >
                  View token tx on Etherscan
                </a>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {listing.offeringType === 'SALE' && listing.status !== 'CLOSED' ? (
                <Link href="/trading">
                  <Button variant="secondary">Buy interest</Button>
                </Link>
              ) : null}
              {canManageListings && (listing.status === 'OPEN' || listing.status === 'PARTIALLY_FILLED') ? (
                <Button variant="secondary" onClick={onClose} disabled={closePending}>
                  Close listing
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-dashed p-6">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </Card>
  );
}
