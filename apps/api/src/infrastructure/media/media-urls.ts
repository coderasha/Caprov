import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;
/** Decoded image cap — keeps list APIs and store.json small. */
export const MAX_IMAGE_BYTES = 1_500_000;
const MAX_HTTP_URL_LENGTH = 2_048;

export function resolveMediaRoot(): string {
  return resolve(process.cwd(), process.env.MEDIA_DIR ?? 'data/media');
}

export function publicMediaBaseUrl(): string {
  return (
    process.env.PUBLIC_API_URL ??
    process.env.API_PUBLIC_URL ??
    'http://localhost:3001/api'
  ).replace(/\/$/, '');
}

export function publicMediaUrl(filename: string): string {
  return `${publicMediaBaseUrl()}/media/${filename}`;
}

function extensionForMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

function isUniformJunk(buffer: Buffer): boolean {
  if (buffer.length < 10_000) return false;
  const first = buffer[0];
  return buffer.every((byte) => byte === first);
}

/**
 * Persist a data-URL image to disk and return a short HTTP media URL.
 * Oversized / corrupt payloads are dropped (returns undefined).
 * Already-short HTTP(S) URLs are kept as-is.
 */
export function persistImageUrl(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();

  if (!trimmed.startsWith('data:')) {
    if (trimmed.length > MAX_HTTP_URL_LENGTH) return undefined;
    return trimmed;
  }

  const match = DATA_URL_RE.exec(trimmed);
  if (!match?.[1] || !match[2]) return undefined;
  const mime = match[1];
  const base64 = match[2];

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return undefined;
  }

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || isUniformJunk(buffer)) {
    return undefined;
  }

  const filename = `${createHash('sha256').update(buffer).digest('hex').slice(0, 32)}.${extensionForMime(mime)}`;
  const root = resolveMediaRoot();
  mkdirSync(root, { recursive: true });
  const fullPath = resolve(root, filename);
  if (!existsSync(fullPath)) {
    writeFileSync(fullPath, buffer);
  }
  return publicMediaUrl(filename);
}

export function persistImageUrls(values?: string[] | null): string[] {
  if (!values?.length) return [];
  const urls = new Set<string>();
  for (const value of values) {
    const persisted = persistImageUrl(value);
    if (persisted) urls.add(persisted);
  }
  return Array.from(urls);
}
