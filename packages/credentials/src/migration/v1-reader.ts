/**
 * Reader v1 — decripta `credentials.enc` do formato legado.
 *
 * Formato v1 (layout documentado no blueprint de migração):
 *   - 16 bytes IV
 *   - 16 bytes salt
 *   - N bytes ciphertext (AES-256-GCM, tag nos últimos 16 bytes)
 *
 * A derivação da chave é PBKDF2-SHA256 (100k iterações, 32 bytes) sobre a
 * `masterKey` fornecida pelo caller. Leitura é idempotente e não toca o
 * arquivo de origem — a migração é sempre não-destrutiva.
 */

import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;

export interface V1Credential {
  readonly value: string;
  readonly email?: string;
  readonly refreshToken?: string;
}

export type V1Credentials = Readonly<Record<string, V1Credential>>;

export async function readV1Credentials(
  filePath: string,
  masterKey: string,
): Promise<V1Credentials> {
  const raw = await readFile(filePath);
  const headerEnd = IV_LENGTH + SALT_LENGTH;

  if (raw.length < headerEnd + AUTH_TAG_LENGTH) {
    throw new Error(`v1 credentials file too short: ${raw.length} bytes`);
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const salt = raw.subarray(IV_LENGTH, headerEnd);
  const ciphertextWithTag = raw.subarray(headerEnd);
  const tagStart = ciphertextWithTag.length - AUTH_TAG_LENGTH;
  const ciphertext = ciphertextWithTag.subarray(0, tagStart);
  const authTag = ciphertextWithTag.subarray(tagStart);

  const key = pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf-8')) as V1Credentials;
}
