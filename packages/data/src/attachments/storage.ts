/**
 * Content-addressed file storage para attachments.
 *
 * Layout: `<baseDir>/<hash[0:2]>/<hash[2:]>` — o prefixo de 2 caracteres
 * evita dezenas de milhares de arquivos em um único diretório (limite
 * prático de inode/listagem em FAT32/NTFS/ext4).
 *
 * Dedup natural: SHA-256 do conteúdo é o filename; duas escritas do mesmo
 * blob colidem no `stat()` e retornam o hash existente.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getAppPaths } from '@g4os/platform';

const DIR_PREFIX_LENGTH = 2;
// Hash deve ser exatamente SHA-256 hex (64 chars). Sem isso, callers
// (backup import, manifest) poderiam passar `'../../etc/passwd'` e o
// `path()` joinaria fora do baseDir — escape de diretório. Mesmo que os
// callers atuais validem via Zod, defesa em profundidade na fronteira
// do storage previne regressão de boundary.
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

function assertValidHash(hash: string): void {
  if (!SHA256_HEX_RE.test(hash)) {
    throw new Error('AttachmentStorage: hash must be SHA-256 hex (64 lowercase chars)');
  }
}

export interface AttachmentStorageOptions {
  /** Base directory. Default: getAppPaths().data/attachments */
  baseDir?: string;
}

export interface StoredBlob {
  hash: string;
  size: number;
}

export class AttachmentStorage {
  private readonly baseDir: string;

  constructor(options: AttachmentStorageOptions = {}) {
    this.baseDir = options.baseDir ?? join(getAppPaths().data, 'attachments');
  }

  path(hash: string): string {
    assertValidHash(hash);
    return join(this.baseDir, hash.slice(0, DIR_PREFIX_LENGTH), hash.slice(DIR_PREFIX_LENGTH));
  }

  async store(content: Buffer): Promise<StoredBlob> {
    const hash = createHash('sha256').update(content).digest('hex');
    const target = this.path(hash);

    try {
      const existing = await stat(target);
      return { hash, size: existing.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return { hash, size: content.length };
  }

  read(hash: string): Promise<Buffer> {
    return readFile(this.path(hash));
  }

  async exists(hash: string): Promise<boolean> {
    try {
      await stat(this.path(hash));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async delete(hash: string): Promise<void> {
    try {
      await unlink(this.path(hash));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
