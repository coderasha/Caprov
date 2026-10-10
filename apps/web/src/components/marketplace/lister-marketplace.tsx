'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import { readFileAsDataUrl } from '@/lib/files';
import { assetClassLabel, money } from '@/lib/format';
import { capPricePerUnitFromTotal, closeOnChainListing, createOnChainListing } from '@/lib/sepolia-marketplace';
import type { HydratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowRight,
  Building2,
  Coins,
  Cpu,
  FileText,
  ImageIcon,
  Info,
  LandPlot,
  MapPin,
  Network,
  StickyNote,
  Tag,
  Upload,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

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
  closedAt?: string;
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  onChainListingId?: string;
  onChainCloseTxHash?: string;
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

interface NetworkInfo {
  liveMintReady: boolean;
  message: string;
  contractAddress?: string;
}

type Filter = 'ALL' | 'TOKENIZED' | 'OFF_CHAIN' | 'CLOSED';

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'TOKENIZED', label: 'Tokenized' },
  { id: 'OFF_CHAIN', label: 'Off-chain' },
  { id: 'CLOSED', label: 'Closed' },
];

const statusLabel: Record<string, string> = {
  OPEN: 'Open',
  PARTIALLY_FILLED: 'Partially filled',
  FILLED: 'Filled',
  CLOSED: 'Closed',
};

const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string').join(' ');
    }
  }
  return error instanceof Error ? error.message : 'Could not publish the listing.';
};

const isTokenized = (listing: Listing) =>
  listing.tokenizationMode === 'LIVE' && Boolean(listing.token);

const shortTokenId = (tokenId: string) =>
  tokenId.length > 14 ? `${tokenId.slice(0, 6)}…${tokenId.slice(-4)}` : tokenId;

function formatCapAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1) {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} CAP`;
  }
  return `${value.toFixed(6).replace(/\.?0+$/, '')} CAP`;
}

export function ListerMarketplace() {
  const client = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const organization = useAuthStore((state) => state.organization);
  const canList = roles.some((role) =>
    ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN'].includes(role),
  );
  const { address: connectedWallet = '', network: selectedNetwork } = useWallet();
  const wallet = connectedWallet;
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    queryFn: async () => (await api.get<NetworkInfo>('/tokenization/network')).data,
  });

  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === form.assetId);
  const allListings = listings.data ?? [];
  const open = useMemo(
    () =>
      (listings.data ?? []).filter((listing) =>
        ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status),
      ),
    [listings.data],
  );
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return allListings.filter((listing) => {
      if (filter === 'CLOSED' && listing.status !== 'CLOSED') return false;
      if (filter === 'TOKENIZED' && !isTokenized(listing)) return false;
      if (filter === 'OFF_CHAIN' && isTokenized(listing)) return false;
      if (!term) return true;
      return [listing.title, listing.asset?.name, listing.asset?.location, listing.summary]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [allListings, query, filter]);

  const supplyNum = Number(form.supply);
  const priceNum = Number(form.price);
  const pricePerUnit =
    Number.isFinite(supplyNum) && supplyNum > 0 && Number.isFinite(priceNum) && priceNum > 0
      ? priceNum / supplyNum
      : 0;

  const previewTitle =
    form.title.trim() || selectedAsset?.name || 'Sample Asset';
  const previewImage =
    form.imageUrl ||
    selectedAsset?.primaryImageUrl ||
    selectedAsset?.imageUrls?.[0] ||
    '/login-hero-skyline.jpg';
  const previewLocation = selectedAsset?.location || 'Location not specified';
  const previewClass = selectedAsset?.assetClass
    ? assetClassLabel[selectedAsset.assetClass]
    : 'Not specified';
  const previewSubtype =
    selectedAsset?.assetClass === 'REAL_ESTATE'
      ? 'Commercial'
      : selectedAsset?.assetClass
        ? assetClassLabel[selectedAsset.assetClass]
        : 'Commercial';

  const publish = useMutation({
    mutationFn: async () => {
      if (!selectedAsset) throw new Error('Select an asset.');
      const listingTitle = form.title.trim();
      const totalAskPrice = Number(form.price);
      if (!Number.isFinite(totalAskPrice) || totalAskPrice < 0.01) {
        throw new Error('Enter a valid total asking price of at least 0.01 USD.');
      }
      if (listingTitle && listingTitle.length < 2) {
        throw new Error('Listing title must contain at least 2 characters.');
      }
      if (form.tokenizeBeforeListing && !network.data?.contractAddress) {
        throw new Error('The active network ERC-1155 token contract is not configured.');
      }
      if (form.tokenizeBeforeListing) {
        const listerWallet = wallet;
        if (!listerWallet) {
          throw new Error(
            'Connect the lister MetaMask wallet from the top-right menu before tokenizing.',
          );
        }
        const pricePerToken = capPricePerUnitFromTotal(form.price, form.supply);
        const token = (
          await api.post<{ id: string; tokenId: string; supply: number }>('/tokenization/tokens', {
            assetId: selectedAsset.id,
            supply: Number(form.supply),
            recipientAddress: listerWallet,
          })
        ).data;
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
          ? `ERC-1155 units were escrowed on ${selectedNetwork.chainName}. Buyers can now escrow CAP against the listing.`
          : 'Non-tokenized listing published.',
      });
      setForm({
        assetId: '',
        title: '',
        summary: '',
        imageUrl: '',
        imageName: '',
        price: '1',
        supply: '1000000',
        tokenizeBeforeListing: true,
      });
      await client.invalidateQueries({ queryKey: ['marketplace'] });
      await client.invalidateQueries({ queryKey: ['tokenization'] });
    },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }),
  });

  const closeListing = useMutation({
    mutationFn: async (listing: Listing) => {
      if (!listing.onChainListingId) throw new Error('This is not an on-chain listing.');
      if (!wallet || wallet.toLowerCase() !== listing.listerWalletAddress?.toLowerCase()) {
        throw new Error('Connect the MetaMask wallet that originally created this listing.');
      }
      const receipt = await closeOnChainListing(listing.onChainListingId);
      await api.post(`/marketplace/on-chain-listings/${listing.id}/sync`, {
        closeTxHash: receipt.hash,
      });
    },
    onSuccess: async () => {
      setNotice({
        tone: 'ok',
        text: `Listing closed on ${selectedNetwork.chainName}. Its unsold ERC-1155 units were returned to the lister wallet.`,
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
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ tone: 'danger', text: 'Listing image must be 5MB or smaller.' });
      return;
    }
    const imageUrl = await readFileAsDataUrl(file);
    setForm((current) => ({ ...current, imageUrl, imageName: file.name }));
  };

  const resetForm = () => {
    setForm({
      assetId: '',
      title: '',
      summary: '',
      imageUrl: '',
      imageName: '',
      price: '1',
      supply: '1000000',
      tokenizeBeforeListing: true,
    });
    setNotice(undefined);
  };

  return (
    <div className="lister-mkt">
      <header className="lister-mkt__header">
        <p className="lister-mkt__eyebrow">Listings</p>
        <h1 className="lister-mkt__title">Create a listing</h1>
        <p className="lister-mkt__lead">
          Tokenize before publishing to mint the ERC-1155 supply, escrow it in the{' '}
          {selectedNetwork.chainName} marketplace, and accept CAP-funded purchase requests.
        </p>
      </header>

      {notice ? (
        <div
          role="status"
          className={cn(
            'lister-mkt__notice',
            notice.tone === 'ok' ? 'is-ok' : 'is-danger',
          )}
        >
          <p>{notice.text}</p>
          <button type="button" onClick={() => setNotice(undefined)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="lister-mkt__layout">
        <form
          className="lister-mkt__form"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(undefined);
            publish.mutate();
          }}
        >
          {!canList ? (
            <section className="lister-mkt__panel">
              <p className="lister-mkt__readonly">
                Your role can browse listings but cannot create one.
              </p>
            </section>
          ) : (
            <>
              <section className="lister-mkt__panel">
                <div className="lister-mkt__panel-head">
                  <h2>Asset information</h2>
                  <Info size={14} strokeWidth={1.75} aria-hidden="true" />
                </div>

                <label className="lister-mkt__field">
                  <span>
                    Asset <i>*</i>
                  </span>
                  <div className="lister-mkt__control">
                    <Building2 size={16} strokeWidth={1.7} aria-hidden="true" />
                    <select
                      required
                      value={form.assetId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, assetId: event.target.value }))
                      }
                    >
                      <option value="">Select an asset</option>
                      {(assets.data ?? []).map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="lister-mkt__tokenize">
                  <input
                    type="checkbox"
                    checked={form.tokenizeBeforeListing}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tokenizeBeforeListing: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Tokenize before listing</strong>
                    <em>
                      Mint a fixed ERC-1155 supply to the connected wallet, then escrow it in the{' '}
                      {selectedNetwork.chainName} marketplace.
                    </em>
                  </span>
                </label>

                {form.tokenizeBeforeListing && !wallet ? (
                  <div className="lister-mkt__wallet-alert">
                    <Wallet size={15} strokeWidth={1.75} aria-hidden="true" />
                    <p>Connect the lister MetaMask wallet above to receive the minted supply.</p>
                  </div>
                ) : null}
              </section>

              {form.tokenizeBeforeListing ? (
                <section className="lister-mkt__panel">
                  <div className="lister-mkt__panel-head">
                    <h2>Token supply &amp; pricing</h2>
                  </div>
                  <div className="lister-mkt__split">
                    <label className="lister-mkt__field">
                      <span>
                        Total ERC-1155 supply <i>*</i>
                      </span>
                      <div className="lister-mkt__control">
                        <Coins size={16} strokeWidth={1.7} aria-hidden="true" />
                        <input
                          type="number"
                          min="1"
                          value={form.supply}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, supply: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <small>Total number of token units to be minted.</small>
                    </label>

                    <label className="lister-mkt__field">
                      <span>
                        Total asking price (USD / CAP) <i>*</i>
                      </span>
                      <div className="lister-mkt__control">
                        <Tag size={16} strokeWidth={1.7} aria-hidden="true" />
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={form.price}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, price: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <small>
                        This is the total for all token units. The {selectedNetwork.chainName}{' '}
                        contract derives the per-unit CAP price; 1 CAP = 1 USD.
                      </small>
                    </label>
                  </div>
                </section>
              ) : (
                <section className="lister-mkt__panel">
                  <div className="lister-mkt__panel-head">
                    <h2>Pricing</h2>
                  </div>
                  <label className="lister-mkt__field">
                    <span>
                      Indicative asking price (USD) <i>*</i>
                    </span>
                    <div className="lister-mkt__control">
                      <Tag size={16} strokeWidth={1.7} aria-hidden="true" />
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={form.price}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, price: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </label>
                </section>
              )}

              <section className="lister-mkt__panel">
                <div className="lister-mkt__panel-head">
                  <h2>Listing details</h2>
                </div>

                <label className="lister-mkt__field">
                  <span>
                    Listing title <i>*</i>
                  </span>
                  <div className="lister-mkt__control">
                    <FileText size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Defaults to the asset name"
                    />
                  </div>
                </label>

                <label className="lister-mkt__field">
                  <span>
                    Summary <i>*</i>
                  </span>
                  <div className="lister-mkt__control lister-mkt__control--area">
                    <StickyNote size={16} strokeWidth={1.7} aria-hidden="true" />
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={form.summary}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, summary: event.target.value }))
                      }
                      placeholder="One or two lines buyers should read first."
                    />
                  </div>
                  <small className="lister-mkt__counter">{form.summary.length}/300</small>
                </label>

                <div className="lister-mkt__field">
                  <span>
                    Listing image <i>*</i>
                  </span>
                  <div
                    className={cn('lister-mkt__drop', form.imageUrl && 'has-file')}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void uploadImage(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => void uploadImage(event.target.files?.[0])}
                    />
                    {form.imageUrl ? (
                      <>
                        <Image
                          src={form.imageUrl}
                          alt=""
                          width={72}
                          height={48}
                          unoptimized
                          className="lister-mkt__drop-thumb"
                        />
                        <div className="lister-mkt__drop-copy">
                          <strong>{form.imageName || 'Selected image'}</strong>
                          <em>PNG, JPG, WebP. Recommended 16:9 ratio. Max 5MB.</em>
                        </div>
                        <button
                          type="button"
                          className="lister-mkt__file-btn"
                          onClick={() => void uploadImage(undefined)}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={22} strokeWidth={1.6} aria-hidden="true" />
                        <div className="lister-mkt__drop-copy">
                          <strong>
                            Choose file <span>or drag and drop</span>
                          </strong>
                          <em>PNG, JPG, WebP. Recommended 16:9 ratio. Max 5MB.</em>
                        </div>
                        <button
                          type="button"
                          className="lister-mkt__file-btn"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload size={14} strokeWidth={1.75} />
                          Choose file
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <div className="lister-mkt__actions">
                <button type="button" className="lister-mkt__cancel" onClick={resetForm}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="lister-mkt__submit"
                  disabled={publish.isPending || !form.assetId}
                >
                  {publish.isPending
                    ? 'Publishing…'
                    : form.tokenizeBeforeListing
                      ? 'Tokenize and publish listing'
                      : 'Publish listing'}
                  <ArrowRight size={15} strokeWidth={1.8} />
                </button>
              </div>
            </>
          )}
        </form>

        <aside className="lister-mkt__preview" aria-label="Listing preview">
          <div className="lister-mkt__preview-head">
            <div>
              <h2>Listing preview</h2>
              <p>Preview updates as you fill the details</p>
            </div>
            <span className="lister-mkt__draft">Draft</span>
          </div>

          <div className="lister-mkt__preview-card">
            <div className="lister-mkt__preview-media">
              <Image
                src={previewImage}
                alt=""
                fill
                sizes="(max-width: 1100px) 100vw, 28vw"
                className="object-cover"
                unoptimized
              />
            </div>

            <div className="lister-mkt__preview-body">
              <h3>{previewTitle}</h3>
              <p className="lister-mkt__preview-location">
                <MapPin size={13} strokeWidth={1.8} />
                {previewLocation}
              </p>
              <div className="lister-mkt__preview-tags">
                <span className="is-class">{previewClass === 'Not specified' ? 'Real Estate' : previewClass}</span>
                <span className="is-sub">{previewSubtype}</span>
              </div>

              <dl className="lister-mkt__preview-stats">
                <div>
                  <dt>Total Supply</dt>
                  <dd>
                    {form.tokenizeBeforeListing && Number.isFinite(supplyNum)
                      ? supplyNum.toLocaleString('en-US')
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Total Price</dt>
                  <dd>
                    {form.tokenizeBeforeListing
                      ? formatCapAmount(priceNum)
                      : Number.isFinite(priceNum)
                        ? money(priceNum, 'USD')
                        : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Price per Unit</dt>
                  <dd>{form.tokenizeBeforeListing ? formatCapAmount(pricePerUnit) : '—'}</dd>
                </div>
              </dl>

              <p className="lister-mkt__preview-summary">
                {form.summary.trim() || 'One or two lines buyers should read first.'}
              </p>

              <div className="lister-mkt__preview-meta">
                <div>
                  <span>
                    <LandPlot size={14} />
                  </span>
                  <div>
                    <strong>Asset Class</strong>
                    <em>{previewClass}</em>
                  </div>
                </div>
                <div>
                  <span>
                    <Building2 size={14} />
                  </span>
                  <div>
                    <strong>Issuer</strong>
                    <em>{organization?.name || 'Your organization'}</em>
                  </div>
                </div>
                <div>
                  <span>
                    <MapPin size={14} />
                  </span>
                  <div>
                    <strong>Location</strong>
                    <em>{previewLocation}</em>
                  </div>
                </div>
                <div>
                  <span>
                    <Network size={14} />
                  </span>
                  <div>
                    <strong>Network</strong>
                    <em>{selectedNetwork.chainName}</em>
                  </div>
                </div>
                <div>
                  <span>
                    <Cpu size={14} />
                  </span>
                  <div>
                    <strong>Tokenization</strong>
                    <em>
                      {form.tokenizeBeforeListing ? 'ERC-1155 (will be minted)' : 'Off-chain'}
                    </em>
                  </div>
                </div>
                <div>
                  <span>
                    <Info size={14} />
                  </span>
                  <div>
                    <strong>Status</strong>
                    <em className="lister-mkt__status-draft">
                      <i /> Draft
                    </em>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="lister-mkt__existing" aria-label="Your listings">
        <div className="lister-mkt__existing-head">
          <div>
            <h2>Your listings</h2>
            <p>
              {open.length} open · {allListings.length} total
            </p>
          </div>
          <div className="lister-mkt__existing-tools">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search listings…"
            />
            <div className="lister-mkt__existing-filters">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(filter === item.id && 'is-active')}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {listings.isLoading ? (
          <div className="lister-mkt__existing-grid">
            {[0, 1, 2].map((key) => (
              <div key={key} className="lister-mkt__existing-skeleton" />
            ))}
          </div>
        ) : visible.length ? (
          <div className="lister-mkt__existing-grid">
            {visible.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                connectedWallet={wallet}
                onClose={(item) => closeListing.mutate(item)}
                closing={closeListing.isPending}
              />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {allListings.length ? 'No listings match this view' : 'No listings are open yet'}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
              {allListings.length
                ? 'Try a different search term or switch the filter back to all listings.'
                : 'Publish the first offering from an existing asset record using the form above.'}
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

function ListingCard({
  listing,
  connectedWallet,
  onClose,
  closing,
}: {
  listing: Listing;
  connectedWallet: string;
  onClose: (listing: Listing) => void;
  closing: boolean;
}) {
  const { network } = useWallet();
  const image = listing.imageUrl || listing.asset?.primaryImageUrl || listing.asset?.imageUrls?.[0];
  const tokenized = isTokenized(listing);
  const explorerUrl = tokenized
    ? sepoliaTxExplorerUrl(listing.token?.txHash ?? listing.token?.explorerUrl)
    : undefined;
  const isLease = listing.offeringType === 'LEASE';
  const isClosed = listing.status === 'CLOSED';
  const totalUnits = listing.token?.supply ?? 0;
  const returnedUnits = isClosed ? (listing.availableTokenUnits ?? 0) : 0;
  const soldUnits = isClosed ? Math.max(0, totalUnits - returnedUnits) : undefined;
  const closeExplorerUrl = sepoliaTxExplorerUrl(listing.onChainCloseTxHash);
  const isLister = Boolean(
    connectedWallet &&
      listing.listerWalletAddress &&
      connectedWallet.toLowerCase() === listing.listerWalletAddress.toLowerCase(),
  );
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
              <Badge tone={listing.status === 'OPEN' ? 'ok' : isClosed ? 'muted' : 'warn'}>
                {statusLabel[listing.status] ?? listing.status}
              </Badge>
              <Badge tone={tokenized ? 'accent' : 'muted'}>
                {tokenized ? 'Tokenized' : 'Off-chain'}
              </Badge>
            </div>
          </div>

          {listing.summary ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
              {listing.summary}
            </p>
          ) : null}

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--line)]/80 pt-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {isLease ? 'Lease rate' : 'Indicative ask'}
              </dt>
              <dd className="mt-1 font-display text-xl font-semibold tabular-nums tracking-[-0.03em] text-[var(--ink)]">
                {money(
                  isLease ? (listing.leaseRate ?? listing.askPrice) : listing.askPrice,
                  listing.currency,
                )}
              </dd>
            </div>
            {tokenized && listing.token ? (
              <div>
                <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Supply
                </dt>
                <dd className="mt-1 text-sm tabular-nums text-[var(--ink)]">
                  {listing.token.supply.toLocaleString('en-GB')} units
                </dd>
              </div>
            ) : null}
            {tokenized && listing.token ? (
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  ERC-1155 token
                </dt>
                <dd
                  className="mt-1 truncate font-mono text-sm text-[var(--ink)]"
                  title={listing.token.tokenId}
                >
                  #{shortTokenId(listing.token.tokenId)}
                </dd>
              </div>
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
            {closeExplorerUrl ? (
              <a
                href={closeExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
              >
                View close transaction
              </a>
            ) : null}
          </div>

          {listing.onChainListingId ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line)]/80 pt-4">
              <p className="mr-auto text-xs text-[var(--muted)]">
                {isClosed
                  ? `Closed${listing.closedAt ? ` ${listing.closedAt.slice(0, 10)}` : ''}. ${soldUnits?.toLocaleString('en-GB') ?? 0} units sold; ${returnedUnits.toLocaleString('en-GB')} unsold units returned to the lister wallet.`
                  : 'Tokenized trading and CAP escrow are available from the Trading section.'}
              </p>
              {!isLister &&
              !isClosed &&
              ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status) ? (
                <Link href="/trading">
                  <Button>Buy</Button>
                </Link>
              ) : null}
              {isLister &&
              !isClosed &&
              ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status) ? (
                <Button
                  variant="secondary"
                  onClick={() => onClose(listing)}
                  disabled={closing}
                >
                  {closing ? `Closing on ${network.chainName}…` : 'Close listing'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
