import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { createId } from '../database/ids';

@Injectable()
export class StorageService {
  private readonly root = resolve(
    process.cwd(),
    process.env.STORAGE_DIR ?? 'storage/documents',
  );

  getStorageStrategy(): 'object-storage' | 'local-disk' {
    return 'local-disk';
  }

  save(
    originalName: string,
    buffer: Buffer,
    mimeType: string,
    directory?: string,
  ): { storageKey: string; mimeType: string; uri: string } {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const prefix = directory?.replace(/^\/+|\/+$/g, '') || new Date().toISOString().slice(0, 10);
    const storageKey = `${prefix}/${createId('bin')}-${safeName}`;
    const fullPath = resolve(this.root, storageKey);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, buffer);
    return { storageKey, mimeType, uri: this.getUri(storageKey) };
  }

  readText(storageKey: string): string | undefined {
    const fullPath = resolve(this.root, storageKey);
    if (!existsSync(fullPath)) {
      return undefined;
    }
    try {
      return readFileSync(fullPath, 'utf8');
    } catch {
      return undefined;
    }
  }

  readBuffer(storageKey: string): Buffer | undefined {
    const fullPath = resolve(this.root, storageKey);
    if (!existsSync(fullPath)) {
      return undefined;
    }
    try {
      return readFileSync(fullPath);
    } catch {
      return undefined;
    }
  }

  getUri(storageKey: string): string {
    return `caprov://storage/${storageKey}`;
  }
}
