'use client';

import { PageHeader } from '@/components/layout/page-header';
import { WalletConnect } from '@/components/wallet-connect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import { readFileAsDataUrl } from '@/lib/files';
import { assetClassLabel, money } from '@/lib/format';
import { capPricePerUnitFromTotal, connectMetaMaskWallet, createOnChainListing, mintAssetFromWallet } from '@/lib/sepolia-marketplace';
import type { HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface Listing {
  id: string;
  assetId: string;
  title: string;
  status: string;
  offeringType?: 'SALE' | 'LEASE';
  summary?: string;
  imageUrl?: string;
  askPrice: number;
  currency: string;
  leaseRate?: number;
  leaseTermMonths?: number;
  createdAt?: string;
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  onChainListingId?: string;
  availableTokenUnits?: number;
  pricePerTokenWei?: string;
  listerWalletAddress?: string;
  token?: {
    tokenId: string;
    supply: number;
    recipientAddress: string;
    txHash?: string;
    explorerUrl?: string;
  } | null;
  asset?: {
    name: string;
    assetClass?: keyof typeof assetClassLabel;
    location?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
}

interface Network {
  liveMintReady: boolean;
  message: string;
  contractAddress?: string;
}

type Filter = 'ALL' | 'TOKENIZED' | 'OFF_CHAIN';

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'TOKENIZED', label: 'Tokenized' },
  { id: 'OFF_CHAIN', label: 'Off-chain' },
];

const statusLabel: Record<string, string> = {
  OPEN: 'Open',
  PARTIALLY_FILLED: 'Partially filled',
};

const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string').join(' ');
  }
  return error instanceof Error ? error.message : 'Could not publish the listing.';
};

const isTokenized = (listing: Listing) => listing.tokenizationMode === 'LIVE' && Boolean(listing.token);

const shortTokenId = (tokenId: string) =>
  tokenId.length > 14 ? `${tokenId.slice(0, 6)}…${tokenId.slice(-4)}` : tokenId;

export default function MarketplacePage() {
  const client = useQueryClient();
  const canList = useAuthStore((state) => state.roles).some((role) =>
    ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN'].includes(role),
  );
  const [wallet, setWallet] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string }>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [form, setForm] = useState({
    assetId: '',
    title: '',
    summary: '',
    imageUrl: '',
    imageName: '',
    price: '1',
    supply: '1000000',
    tokenizeBeforeListing: true,
  });

  const listings = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => (await api.get<{ listings: Listing[] }>('/marketplace')).data.listings,
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const network = useQuery({
    queryKey: ['tokenization-network'],
    queryFn: async () => (await api.get<Network>('/tokenization/network')).data,
  });

  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === form.assetId);
  const open = useMemo(
    () => (listings.data ?? []).filter((listing) => ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status)),
    [listings.data],
  );
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return open.filter((listing) => {
      if (filter === 'TOKENIZED' && !isTokenized(listing)) {
        return false;
      }
      if (filter === 'OFF_CHAIN' && isTokenized(listing)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [listing.title, listing.asset?.name, listing.asset?.location, listing.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [open, query, filter]);

  const tokenizedCount = open.filter(isTokenized).length;
  const stats = [
    { label: 'Open listings', value: String(open.length), hint: 'Available to browse right now' },
    { label: 'Tokenized', value: String(tokenizedCount), hint: 'Backed by live ERC-1155 supply' },
    { label: 'Off-chain', value: String(open.length - tokenizedCount), hint: 'Published without a token' },
    {
      label: 'Assets represented',
      value: String(new Set(open.map((listing) => listing.assetId)).size),
      hint: 'Distinct records behind the listings',
    },
  ];

  const publish = useMutation({
    mutationFn: async () => {
      if (!selectedAsset) throw new Error('Select an asset.');
      const listingTitle = form.title.trim();
      const totalAskPrice = Number(form.price);
      if (!Number.isFinite(totalAskPrice) || totalAskPrice < 0.01) throw new Error('Enter a valid total asking price of at least 0.01 USD.');
      if (listingTitle && listingTitle.length < 2) throw new Error('Listing title must contain at least 2 characters.');
      if (form.tokenizeBeforeListing && !network.data?.contractAddress)
        throw new Error('The Sepolia ERC-1155 token contract is not configured.');
      if (form.tokenizeBeforeListing) {
        // Requesting account permissions from this click lets MetaMask present
        // its native account chooser instead of relying on a server-held key.
        let listerWallet = wallet;
        if (!listerWallet) {
          const connected = await connectMetaMaskWallet();
          listerWallet = connected.address;
          setWallet(listerWallet);
        }
        // The form price is the whole offering value. The V2 contract needs a
        // per-unit CAP amount, so derive it before minting any live supply.
        const pricePerToken = capPricePerUnitFromTotal(form.price, form.supply);
        const mint = await mintAssetFromWallet({
          assetId: selectedAsset.id,
          supply: Number(form.supply),
          recipientAddress: listerWallet,
        });
        const token = (await api.post<{ id: string; tokenId: string; supply: number }>('/tokenization/tokens/wallet-mints', {
          assetId: selectedAsset.id,
          supply: Number(form.supply),
          recipientAddress: listerWallet,
          txHash: mint.txHash,
        })).data;
        const onChain = await createOnChainListing({
          assetTokenId: token.tokenId,
          units: String(token.supply),
          pricePerToken,
        });
        await api.post('/marketplace/on-chain-listings', {
          assetId: selectedAsset.id,
          tokenPositionId: token.id,
          onChainListingId: onChain.listingId,
          onChainTxHash: onChain.txHash,
          // The confirmed Listed event, not stale UI wallet state, is the
          // source of truth for the address that escrowed the ERC-1155 units.
          listerWalletAddress: onChain.sellerAddress,
          availableTokenUnits: token.supply,
          pricePerTokenWei: onChain.pricePerTokenWei,
          askPrice: totalAskPrice,
          title: listingTitle || undefined,
          summary: form.summary || undefined,
          imageUrl: form.imageUrl || undefined,
        });
        return;
      }
      await api.post('/marketplace/listings', {
        assetId: selectedAsset.id,
        title: listingTitle || undefined,
        summary: form.summary || undefined,
        imageUrl: form.imageUrl || undefined,
        offeringType: 'SALE',
        askPrice: totalAskPrice,
        tokenizeOnCreate: false,
      });
    },
    onSuccess: async () => {
      setNotice({
        tone: 'ok',
        text: form.tokenizeBeforeListing
          ? 'ERC-1155 units were escrowed on Sepolia. Buyers can now escrow CAP against the listing.'
          : 'Non-tokenized listing published.',
      });
      await client.invalidateQueries({ queryKey: ['marketplace'] });
      await client.invalidateQueries({ queryKey: ['tokenization'] });
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }),
  });

  const uploadImage = async (file?: File) => {
    if (!file) {
      setForm((current) => ({ ...current, imageUrl: '', imageName: '' }));
      return;
    }
    const imageUrl = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, imageUrl, imageName: file.name }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Marketplace"
        title="Asset marketplace"
        description="Tokenized listings escrow ERC-1155 units on Sepolia. Buyers escrow CAP, and sellers approve the final on-chain settlement."
      />

      <WalletConnect onConnected={setWallet} />

      {notice ? (
        <div
          role="status"
          className={
            notice.tone === 'ok'
              ? 'flex items-start gap-3 rounded-2xl border border-[var(--ok)]/25 bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]'
              : 'flex items-start gap-3 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]'
          }
        >
          <p className="min-w-0 flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNotice(undefined)}
            className="shrink-0 text-xs uppercase tracking-[0.14em] opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search listings by title, asset, or location"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="sm:max-w-sm"
            />
            <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-1">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={
                    filter === item.id
                      ? 'rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] shadow-[var(--shadow-soft)]'
                      : 'rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--ink)]'
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {listings.isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((key) => (
                <Card key={key} className="h-40 animate-pulse bg-[var(--paper-2)]/50" />
              ))}
            </div>
          ) : visible.length ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {visible.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Showing {visible.length} of {open.length} open listing{open.length === 1 ? '' : 's'}.
              </p>
            </>
          ) : open.length ? (
            <Card className="p-8 text-center">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                No listings match this view
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                Try a different search term or switch the filter back to all listings.
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={() => {
                  setQuery('');
                  setFilter('ALL');
                }}
              >
                Clear filters
              </Button>
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                No listings are open yet
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                {canList
                  ? 'Publish the first offering from an existing asset record using the form alongside.'
                  : 'Listings published by your organization will appear here.'}
              </p>
            </Card>
          )}
        </section>

        <Card className="h-fit p-6 xl:sticky xl:top-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Create a listing</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Tokenize before publishing to mint the ERC-1155 supply, escrow it in the Sepolia marketplace, and accept CAP-funded purchase requests.
          </p>

          {!canList ? (
            <p className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--muted)]">
              Your role can browse listings but cannot create one.
            </p>
          ) : (
            <form
              className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setNotice(undefined);
                publish.mutate();
              }}
            >
              <Field label="Asset">
                <Select
                  required
                  value={form.assetId}
                  onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))}
                >
                  <option value="">Select an asset</option>
                  {(assets.data ?? []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <label className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={form.tokenizeBeforeListing}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tokenizeBeforeListing: event.target.checked }))
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium text-[var(--ink)]">Tokenize before listing</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                    Mint a fixed ERC-1155 supply to the connected wallet, then escrow it in the Sepolia marketplace.
                  </span>
                </span>
              </label>

              {form.tokenizeBeforeListing && !wallet ? (
                <p className="rounded-xl border border-[var(--warn)]/25 bg-[var(--warn-soft)] px-4 py-3 text-xs leading-5 text-[var(--warn)]">
                  Connect the lister MetaMask wallet above to receive the minted supply.
                </p>
              ) : null}

              {form.tokenizeBeforeListing ? (
                <Field label="Total ERC-1155 supply">
                  <Input
                    type="number"
                    min="1"
                    value={form.supply}
                    onChange={(event) => setForm((current) => ({ ...current, supply: event.target.value }))}
                    required
                  />
                </Field>
              ) : null}

              <Field label={form.tokenizeBeforeListing ? 'Total asking price (USD / CAP)' : 'Indicative asking price (USD)'}>
                <Input
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  required
                />
                {form.tokenizeBeforeListing ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    This is the total for all token units. The Sepolia contract derives the per-unit CAP price; 1 CAP = 1 USD.
                  </p>
                ) : null}
              </Field>

              <Field label="Listing title">
                <Input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={selectedAsset?.name || 'Defaults to the asset name'}
                />
              </Field>

              <Field label="Summary">
                <Textarea
                  rows={3}
                  value={form.summary}
                  onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                  placeholder="One or two lines buyers should read first."
                />
              </Field>

              <Field label="Listing image">
                <Input type="file" accept="image/*" onChange={(event) => void uploadImage(event.target.files?.[0])} />
              </Field>
              {form.imageUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2">
                  <Image
                    src={form.imageUrl}
                    alt=""
                    width={96}
                    height={64}
                    unoptimized
                    className="h-12 w-16 shrink-0 rounded-lg object-cover"
                  />
                  <p className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">{form.imageName}</p>
                  <button
                    type="button"
                    onClick={() => void uploadImage(undefined)}
                    className="shrink-0 text-xs uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              <Button type="submit" disabled={publish.isPending || !form.assetId}>
                {publish.isPending
                  ? 'Publishing…'
                  : form.tokenizeBeforeListing
                    ? 'Tokenize and publish listing'
                    : 'Publish listing'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const image = listing.imageUrl || listing.asset?.primaryImageUrl || listing.asset?.imageUrls?.[0];
  const tokenized = isTokenized(listing);
  const explorerUrl = tokenized
    ? sepoliaTxExplorerUrl(listing.token?.txHash ?? listing.token?.explorerUrl)
    : undefined;
  const isLease = listing.offeringType === 'LEASE';
  const context = [
    listing.asset?.name,
    listing.asset?.assetClass ? assetClassLabel[listing.asset.assetClass] : undefined,
    listing.asset?.location,
  ].filter(Boolean);

  return (
    <Card className="overflow-hidden transition hover:border-[var(--gold)]/35">
      <div className="grid">
        {image ? (
          <Image
            src={image}
            alt=""
            width={416}
            height={312}
            unoptimized
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="flex h-44 w-full items-center justify-center bg-[var(--paper-2)]">
            <span className="font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--muted)]/60">
              {(listing.asset?.name ?? listing.title).slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {listing.title}
              </h3>
              {context.length ? (
                <p className="mt-1 text-sm text-[var(--muted)]">{context.join(' · ')}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge tone={listing.status === 'OPEN' ? 'ok' : 'warn'}>
                {statusLabel[listing.status] ?? listing.status}
              </Badge>
              <Badge tone={tokenized ? 'accent' : 'muted'}>{tokenized ? 'Tokenized' : 'Off-chain'}</Badge>
            </div>
          </div>

          {listing.summary ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{listing.summary}</p>
          ) : null}

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--line)]/80 pt-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {isLease ? 'Lease rate' : 'Indicative ask'}
              </dt>
              <dd className="mt-1 font-display text-xl font-semibold tabular-nums tracking-[-0.03em] text-[var(--ink)]">
                {money(isLease ? (listing.leaseRate ?? listing.askPrice) : listing.askPrice, listing.currency)}
              </dd>
            </div>
            {isLease && listing.leaseTermMonths ? (
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Term</dt>
                <dd className="mt-1 text-sm tabular-nums text-[var(--ink)]">{listing.leaseTermMonths} months</dd>
              </div>
            ) : null}
            {tokenized && listing.token ? (
              <>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Supply</dt>
                  <dd className="mt-1 text-sm tabular-nums text-[var(--ink)]">
                    {listing.token.supply.toLocaleString('en-GB')} units
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">ERC-1155 token</dt>
                  <dd className="mt-1 truncate font-mono text-sm text-[var(--ink)]" title={listing.token.tokenId}>
                    #{shortTokenId(listing.token.tokenId)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <Link
              href={`/assets/${listing.assetId}`}
              className="font-medium text-[var(--ink)] underline-offset-4 hover:underline"
            >
              View asset
            </Link>
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
              >
                View on transaction explorer
              </a>
            ) : null}
          </div>
          {listing.onChainListingId ? <p className="mt-5 border-t border-[var(--line)]/80 pt-4 text-xs text-[var(--muted)]">Tokenized trading and CAP escrow are available from the Trading section.</p> : null}
        </div>
      </div>
    </Card>
  );
}
