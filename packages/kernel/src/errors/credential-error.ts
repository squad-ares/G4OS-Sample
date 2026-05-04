import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class CredentialError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `credential.${string}`> },
  ) {
    super(options);
    this.name = 'CredentialError';
  }

  static notFound(key: string): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_NOT_FOUND,
      message: `Credential not found: ${key}`,
      context: { key },
    });
  }

  static locked(key: string): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_LOCKED,
      message: `Credential is locked: ${key}`,
      context: { key },
    });
  }

  static decryptFailed(key: string, cause: unknown): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_DECRYPT_FAILED,
      message: `Failed to decrypt credential: ${key}`,
      context: { key },
      cause,
    });
  }

  static expired(key: string): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_EXPIRED,
      message: `Credential expired: ${key}`,
      context: { key },
    });
  }

  static invalidKey(key: string): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_INVALID_KEY,
      message: `Invalid credential key: ${key}`,
      context: { key },
    });
  }

  /**
   * Razão tipada (enum) para discriminação caller-side sem parsear strings;
   * `switch (err.context.reason)` quando `err.code === CREDENTIAL_INVALID_VALUE`.
   */
  static invalidValue(reason: CredentialInvalidValueReason): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_INVALID_VALUE,
      message: `Invalid credential value: ${reason}`,
      context: { reason },
    });
  }

  /**
   * CR-18 F-C5: erro de IO em backend file-based (FileKeychain) — mkdir
   * EACCES, writeAtomic ENOSPC, readdir fail. Discriminado de
   * `decryptFailed` para que callers façam fluxo de repair correto
   * (retry com cooldown vs. wipe + restore).
   */
  static ioError(op: string, cause: unknown): CredentialError {
    return new CredentialError({
      code: ErrorCode.CREDENTIAL_IO_ERROR,
      message: `Credential IO error during ${op}`,
      context: { op },
      cause,
    });
  }
}

export type CredentialInvalidValueReason =
  | 'empty'
  | 'too_long'
  | 'too_many_tags'
  | 'tag_length_out_of_range';
