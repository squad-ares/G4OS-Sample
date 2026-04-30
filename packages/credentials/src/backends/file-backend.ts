/**
 * FileKeychain — backend sobre arquivos encriptados via um codec
 * fornecido (Electron `safeStorage` em produção, noop em dev).
 *
 * Layout: `<baseDir>/<base64url(key)>.enc`. Cada escrita é atômica
 * via `writeAtomic` do kernel (`write→fsync→rename + dir fsync`).
 * Combinada com o mutex do `CredentialVault`, garante que crash
 * mid-write não corrompa o `.enc` — Dor #3 V1 (perda de credenciais
 * por arquivo truncado pós-crash) está coberta pela ADR-0050.
 */

import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CredentialError, Result } from '@g4os/kernel/errors';
import { CredentialError as CredentialErrorClass } from '@g4os/kernel/errors';
import { writeAtomic } from '@g4os/kernel/fs';
import type { IKeychain } from '@g4os/platform';
import { err, ok } from 'neverthrow';

const FILE_EXT = '.enc';

export interface SecretCodec {
  readonly available: boolean;
  encrypt(value: string): Buffer;
  decrypt(payload: Buffer): string;
}

export interface FileKeychainOptions {
  readonly baseDir: string;
  readonly codec: SecretCodec;
}

export class FileKeychain implements IKeychain {
  private readonly baseDir: string;
  private readonly codec: SecretCodec;
  private readyPromise: Promise<void> | null = null;

  constructor(options: FileKeychainOptions) {
    this.baseDir = options.baseDir;
    this.codec = options.codec;
  }

  async set(key: string, value: string): Promise<Result<void, CredentialError>> {
    const ready = await this.ensureReady();
    if (ready.isErr()) return err(ready.error);

    try {
      const payload = this.codec.encrypt(value);
      await writeAtomic(this.pathFor(key), payload, { mode: 0o600 });
      return ok(undefined);
    } catch (cause) {
      return err(CredentialErrorClass.decryptFailed(key, cause));
    }
  }

  async get(key: string): Promise<Result<string, CredentialError>> {
    // Bloquear leitura quando codec não está disponível.
    // Sem isso, em Linux sem libsecret ou Windows sem DPAPI, decrypt
    // tentaria operar em buffer vazio/inválido e retornaria erro genérico.
    const ready = await this.ensureReady();
    if (ready.isErr()) return err(ready.error);

    try {
      const payload = await readFile(this.pathFor(key));
      const value = this.codec.decrypt(payload);
      return ok(value);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(CredentialErrorClass.notFound(key));
      }
      return err(CredentialErrorClass.decryptFailed(key, cause));
    }
  }

  async delete(key: string): Promise<Result<void, CredentialError>> {
    // delete não opera no codec — não precisa de ensureReady.
    try {
      await unlink(this.pathFor(key));
      return ok(undefined);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return ok(undefined);
      return err(CredentialErrorClass.decryptFailed(key, cause));
    }
  }

  async list(): Promise<Result<string[], CredentialError>> {
    const ready = await this.ensureReady();
    if (ready.isErr()) return err(ready.error);

    try {
      const files = await readdir(this.baseDir);
      const keys: string[] = [];
      for (const f of files) {
        if (!f.endsWith(FILE_EXT)) continue;
        keys.push(decodeName(f));
      }
      return ok(keys);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
      return err(CredentialErrorClass.decryptFailed('list', cause));
    }
  }

  private ensureReady(): Promise<Result<void, CredentialError>> {
    if (!this.codec.available) {
      return Promise.resolve(err(CredentialErrorClass.locked('codec-unavailable')));
    }
    if (this.readyPromise === null) {
      this.readyPromise = mkdir(this.baseDir, { recursive: true }).then(() => undefined);
    }
    return this.readyPromise.then(
      () => ok<void, CredentialError>(undefined),
      (cause: unknown) =>
        err<void, CredentialError>(CredentialErrorClass.decryptFailed('mkdir', cause)),
    );
  }

  private pathFor(key: string): string {
    return join(this.baseDir, encodeName(key));
  }
}

function encodeName(key: string): string {
  return `${Buffer.from(key, 'utf-8').toString('base64url')}${FILE_EXT}`;
}

function decodeName(fileName: string): string {
  const bare = fileName.endsWith(FILE_EXT) ? fileName.slice(0, -FILE_EXT.length) : fileName;
  return Buffer.from(bare, 'base64url').toString('utf-8');
}
