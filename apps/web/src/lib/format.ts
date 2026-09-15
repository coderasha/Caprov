import type { AssetClass, AssetStatus, DocumentType, MembershipRole } from '@caprov/types';

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  SGD: 'S$',
  INR: '₹',
};

export function money(amount?: number | null, currency = 'USD') {
  if (amount == null || Number.isNaN(amount)) {
    return '—';
  }
  const symbol = currencySymbols[currency] ?? `${currency} `;
  if (amount >= 1_000_000_000) {
    return `${symbol}${(amount / 1_000_000_000).toFixed(2)}bn`;
  }
  if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(2)}m`;
  }
  return `${symbol}${amount.toLocaleString('en-GB')}`;
}

export function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function confidenceLabel(value?: number) {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

export const assetClassLabel: Record<AssetClass, string> = {
  REAL_ESTATE: 'Real estate',
  PRIVATE_CREDIT: 'Private credit',
  PRIVATE_EQUITY: 'Private equity',
  INFRASTRUCTURE: 'Infrastructure',
  AVIATION: 'Aviation',
  ART: 'Art',
  AGRICULTURE: 'Agriculture',
  FUND: 'Fund',
  OTHER: 'Other',
};

export const assetStatusLabel: Record<AssetStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  UNDER_REVIEW: 'Under review',
  ARCHIVED: 'Archived',
};

export const documentTypeLabel: Record<DocumentType, string> = {
  TITLE_DEED: 'Title deed',
  SPA: 'Purchase agreement',
  PURCHASE_AGREEMENT: 'Purchase agreement',
  VALUATION_MEMO: 'Valuation memo',
  SALE_AGREEMENT: 'Sale agreement',
  ENCUMBRANCE_CERTIFICATE: 'Encumbrance certificate',
  KYC: 'KYC / ownership',
  INSURANCE: 'Insurance',
  FINANCIAL_STATEMENT: 'Financial statement',
  CAP_TABLE: 'Cap table',
  LPA: 'LPA',
  OTHER: 'Other',
};

export const documentTypeOptions = (
  Object.entries(documentTypeLabel) as Array<[DocumentType, string]>
).filter(([value]) => value !== 'SPA');

export const roleLabel: Record<MembershipRole, string> = {
  PLATFORM_ADMIN: 'Platform admin',
  ORG_ADMIN: 'Org admin',
  ANALYST: 'Analyst',
  BANKER: 'Banker',
  COMPLIANCE: 'Compliance',
  VIEWER: 'Viewer',
};

export function riskTone(rating?: string) {
  switch (rating) {
    case 'LOW':
      return 'ok';
    case 'MODERATE':
      return 'warn';
    case 'ELEVATED':
      return 'accent';
    case 'HIGH':
      return 'danger';
    default:
      return 'muted';
  }
}
