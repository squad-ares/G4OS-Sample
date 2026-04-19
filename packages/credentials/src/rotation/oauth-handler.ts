/**
 * Handler OAuth genérico. Aceita qualquer chave com prefixo `oauth.`
 * (ex.: `oauth.google`, `oauth.github`) e troca um refresh token por
 * access token via endpoint `tokenUrl`.
 *
 * A resposta do provider deve seguir o shape padrão RFC-6749
 * (`access_token`, `expires_in` em segundos). Erros HTTP propagam como
 * exceção — o orchestrator isola por chave e loga.
 */

import type { RotatedCredential, RotationHandler } from './handler.ts';

const OAUTH_KEY_PREFIX = 'oauth.';
const MILLIS_PER_SECOND = 1000;

export interface OAuthRotationOptions {
  readonly tokenUrl: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly fetchImpl?: typeof fetch;
}

interface OAuthTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
}

export class OAuthRotationHandler implements RotationHandler {
  private readonly tokenUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OAuthRotationOptions) {
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  canHandle(key: string): boolean {
    return key.startsWith(OAUTH_KEY_PREFIX);
  }

  async rotate(currentRefreshToken: string): Promise<RotatedCredential> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    });
    if (this.clientId !== undefined) body.set('client_id', this.clientId);
    if (this.clientSecret !== undefined) body.set('client_secret', this.clientSecret);

    const response = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`OAuth rotation failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OAuthTokenResponse;
    return {
      newValue: data.access_token,
      expiresAt: Date.now() + data.expires_in * MILLIS_PER_SECOND,
    };
  }
}
