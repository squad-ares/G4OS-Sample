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
      code: ErrorCode.CREDENTIAL_NOT_FOUND,
      message: `Invalid credential key: ${key}`,
      context: { key },
    });
  }
}
