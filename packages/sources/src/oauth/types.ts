import type { Result } from 'neverthrow';

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
  readonly tokenType: string;
  readonly scope: readonly string[];
}

export interface OAuthConfig {
  readonly clientId: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly audience?: string;
  readonly extraAuthParams?: Readonly<Record<string, string>>;
}

export type OAuthErrorCode =
  | 'no_code'
  | 'state_mismatch'
  | 'callback_timeout'
  | 'exchange_failed'
  | 'pending_not_found'
  /** RFC 6749 §4.1.2.1 — IdP retornou `error=access_denied` ou similar. */
  | 'provider_denied';

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  override readonly cause?: unknown;

  constructor(code: OAuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }

  static noCode(): OAuthError {
    return new OAuthError('no_code', 'OAuth callback missing authorization code');
  }

  static stateMismatch(): OAuthError {
    return new OAuthError('state_mismatch', 'OAuth state parameter mismatch');
  }

  static timeout(): OAuthError {
    return new OAuthError('callback_timeout', 'OAuth callback timed out');
  }

  static exchangeFailed(cause: unknown): OAuthError {
    return new OAuthError('exchange_failed', 'OAuth token exchange failed', cause);
  }

  static pendingNotFound(): OAuthError {
    return new OAuthError('pending_not_found', 'No pending OAuth flow matched state');
  }

  /** RFC 6749 §4.1.2.1 — IdP rejeitou com `error` explícito no redirect. */
  static providerDenied(error: string, description?: string): OAuthError {
    const detail = description ? `${error}: ${description}` : error;
    return new OAuthError('provider_denied', `OAuth provider denied: ${detail}`);
  }
}

export interface ExchangeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly config: OAuthConfig;
}

export interface TokenExchanger {
  exchange(input: ExchangeInput): Promise<Result<OAuthTokens, OAuthError>>;
}
