import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { createId } from '../database/ids';

function projectRoot(): string {
  let current = process.cwd();
  while (true) {
    if (
      existsSync(resolve(current, 'pnpm-workspace.yaml')) ||
      existsSync(resolve(current, '.git'))
    ) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function storageRoots(): string[] {
  const configured = process.env.STORAGE_DIR ?? 'storage/documents';
  const primary = isAbsolute(configured)
    ? resolve(configured)
    : resolve(projectRoot(), configured);
  const local = isAbsolute(configured)
    ? primary
    : resolve(process.cwd(), configured);
  return primary === local ? [primary] : [primary, local];
}

@Injectable()
export class StorageService {
  private readonly roots = storageRoots();

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
    const fullPath = resolve(this.roots[0]!, storageKey);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, buffer);
    return { storageKey, mimeType, uri: this.getUri(storageKey) };
  }

  readText(storageKey: string): string | undefined {
    const fullPath = this.locate(storageKey);
    if (!fullPath) {
      return undefined;
    }
    try {
      return readFileSync(fullPath, 'utf8');
    } catch {
      return undefined;
    }
  }

  readBuffer(storageKey: string): Buffer | undefined {
    const fullPath = this.locate(storageKey);
    if (!fullPath) {
      return undefined;
    }
    try {
      return readFileSync(fullPath);
    } catch {
      return undefined;
    }
  }

  private locate(storageKey: string): string | undefined {
    const relative = storageKey.replace(/^[/\\]+/, '');
    if (!relative || relative.split(/[/\\]/).includes('..')) {
      return undefined;
    }
    for (const root of this.roots) {
      const fullPath = resolve(root, relative);
      const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
      if (fullPath !== root && !fullPath.startsWith(rootPrefix)) {
        continue;
      }
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
    return undefined;
  }

  getUri(storageKey: string): string {
    return `caprov://storage/${storageKey}`;
  }
}
