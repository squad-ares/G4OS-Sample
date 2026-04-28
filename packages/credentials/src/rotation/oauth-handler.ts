/**
 * Handler OAuth genérico. Aceita qualquer chave com prefixo `oauth.`
 * (ex.: `oauth.google`, `oauth.github`) e troca um refresh token por
 * access token via endpoint `tokenUrl`.
 *
 * A resposta do provider deve seguir o shape padrão RFC-6749
 * (`access_token`, `expires_in` em segundos). Erros HTTP propagam como
 * exceção — o orchestrator isola por chave e loga.
 */

import { z } from 'zod';
import type { RotatedCredential, RotationHandler } from './handler.ts';

// CR9: alguns providers retornam HTTP 200 com payload de erro (ex.: Google
// `{"error":"invalid_grant"}` retornava 400, mas há casos de 200 mal
// configurados em proxies). Sem validação de shape, `as OAuthTokenResponse`
// permitia `expires_in` virar `undefined` → `NaN` no expiresAt → vault
// persistia token com timestamp absurdo. Validação obrigatória do contrato.
const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().finite().positive(),
});

/**
 * Erro estruturado de rotação OAuth com discriminator. Permite caller
 * (orchestrator, telemetria, dashboard) agrupar falhas por kind sem
 * parsear strings (CR5-18).
 */
export type OAuthRotationFailure =
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | { readonly kind: 'http_error'; readonly status: number; readonly statusText: string }
  | { readonly kind: 'network'; readonly cause: unknown };

export class OAuthRotationError extends Error {
  readonly kind: OAuthRotationFailure['kind'];
  readonly detail: OAuthRotationFailure;

  constructor(failure: OAuthRotationFailure) {
    super(formatMessage(failure));
    this.name = 'OAuthRotationError';
    this.kind = failure.kind;
    this.detail = failure;
  }
}

function formatMessage(failure: OAuthRotationFailure): string {
  switch (failure.kind) {
    case 'timeout':
      return `OAuth rotation timed out after ${failure.timeoutMs}ms`;
    case 'http_error':
      return `OAuth rotation failed: ${failure.status} ${failure.statusText}`;
    case 'network':
      return `OAuth rotation network error: ${
        failure.cause instanceof Error ? failure.cause.message : String(failure.cause)
      }`;
    default: {
      const _exhaustive: never = failure;
      void _exhaustive;
      return 'OAuth rotation failed';
    }
  }
}

const OAUTH_KEY_PREFIX = 'oauth.';
const MILLIS_PER_SECOND = 1000;
/**
 * Default timeout para chamada do `tokenUrl`. Provider lento ou offline
 * trava o ciclo de rotação se não houver deadline (CR4-21).
 */
const DEFAULT_ROTATION_TIMEOUT_MS = 30_000;

export interface OAuthRotationOptions {
  readonly tokenUrl: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly fetchImpl?: typeof fetch;
  /** Timeout em ms para o fetch ao tokenUrl. Default 30s. */
  readonly timeoutMs?: number;
}

export class OAuthRotationHandler implements RotationHandler {
  private readonly tokenUrl: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OAuthRotationOptions) {
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_ROTATION_TIMEOUT_MS;
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

    // CR4-21: timeout previne hang quando provider está lento/offline.
    // Orchestrator isola erros por chave; timeout é tratado como falha
    // de rotação normal (ciclo será re-tentado no próximo scan).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    let response: Response;
    try {
      response = await this.fetchImpl(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new OAuthRotationError({ kind: 'timeout', timeoutMs: this.timeoutMs });
      }
      throw new OAuthRotationError({ kind: 'network', cause });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new OAuthRotationError({
        kind: 'http_error',
        status: response.status,
        statusText: response.statusText,
      });
    }

    // CR9: validação Zod de shape — protege contra providers que mandam
    // 200 com payload de erro / proxies mal configurados / mock servers
    // em testes que esquecem de retornar `expires_in`.
    const raw = (await response.json()) as unknown;
    const parsed = OAuthTokenResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new OAuthRotationError({
        kind: 'http_error',
        status: response.status,
        statusText: `invalid OAuth response shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      });
    }
    const data = parsed.data;
    // CR7-50: subtrair buffer 60s do expiry. Sem isso, clock skew entre
    // server (que conta `expires_in` desde sua perspectiva) e client
    // pode causar token "ainda válido" na perspective do client mas
    // já expirado no servidor. O orchestrator também tem buffer interno
    // de rotation (5min default), mas defesa em profundidade não custa.
    const CLOCK_SKEW_BUFFER_SECONDS = 60;
    const adjustedExpiresIn = Math.max(0, data.expires_in - CLOCK_SKEW_BUFFER_SECONDS);
    return {
      newValue: data.access_token,
      expiresAt: Date.now() + adjustedExpiresIn * MILLIS_PER_SECOND,
    };
  }
}
