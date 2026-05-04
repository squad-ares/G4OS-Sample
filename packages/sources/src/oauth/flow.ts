import { err, ok, type Result } from 'neverthrow';
import type { OAuthCallbackHandler } from './callback-handler.ts';
import { type LoopbackServer, startLoopbackServer } from './loopback.ts';
import { generatePkce, generateState, type PkcePair } from './pkce.ts';
import { type OAuthConfig, OAuthError, type OAuthTokens, type TokenExchanger } from './types.ts';

export interface BuildAuthUrlInput {
  readonly config: OAuthConfig;
  readonly state: string;
  readonly pkce: PkcePair;
}

export function buildAuthUrl(input: BuildAuthUrlInput): string {
  const { config, state, pkce } = input;
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', pkce.method);
  if (config.scopes.length > 0) {
    url.searchParams.set('scope', config.scopes.join(' '));
  }
  if (config.audience) {
    url.searchParams.set('audience', config.audience);
  }
  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export interface PerformOAuthInput {
  readonly config: OAuthConfig;
  readonly callbackHandler: OAuthCallbackHandler;
  readonly exchanger: TokenExchanger;
  readonly openBrowser: (url: string) => void | Promise<void>;
  readonly timeoutMs?: number;
}

export async function performOAuth(
  input: PerformOAuthInput,
): Promise<Result<OAuthTokens, OAuthError>> {
  const pkce = generatePkce();
  const state = generateState();
  const authUrl = buildAuthUrl({ config: input.config, state, pkce });

  const waiting = input.callbackHandler.waitFor(state, input.timeoutMs);
  await input.openBrowser(authUrl);
  const callback = await waiting;
  if (callback.isErr()) return err(callback.error);

  // RFC 6749 §4.1.2.1: verificar `error` antes de `code`. IdPs retornam
  // `error=access_denied&error_description=...` no redirect — sem este check
  // o chamador vê "missing authorization code" em vez da razão real.
  const providerError = callback.value.get('error');
  if (providerError) {
    const description = callback.value.get('error_description') ?? undefined;
    return err(OAuthError.providerDenied(providerError, description));
  }

  const code = callback.value.get('code');
  if (!code) return err(OAuthError.noCode());

  const returnedState = callback.value.get('state');
  if (returnedState !== state) return err(OAuthError.stateMismatch());

  return input.exchanger.exchange({
    code,
    codeVerifier: pkce.verifier,
    config: input.config,
  });
}

export interface PerformOAuthLoopbackInput {
  /**
   * Config OAuth SEM o `redirectUri` final — o loopback server bind a uma
   * porta dinâmica (`port: 0` por default) e o helper recompõe a URL.
   * Caller passa só os campos do provider (clientId, endpoints, scopes).
   */
  readonly config: Omit<OAuthConfig, 'redirectUri'>;
  readonly exchanger: TokenExchanger;
  readonly openBrowser: (url: string) => void | Promise<void>;
  /** Path do callback no loopback. Default `/callback`. */
  readonly callbackPath?: string;
  /** Porta fixa opcional. Default 0 (ephemeral). */
  readonly port?: number;
  /** Timeout total (loopback wait + token exchange). Default 5min. */
  readonly timeoutMs?: number;
}

/**
 * CR-18 F-S3: helper completo que SOLUCIONA o gap da `performOAuth` pura
 * com loopback. O bug original: caller que chamava `startLoopbackServer({port:0})`
 * + `buildAuthUrl({config: {redirectUri: 'http://127.0.0.1:???'}})` tinha
 * que conhecer a porta antes do bind — impossível com porta dinâmica.
 * Resultado: IdP redirecionava para porta fixa errada, flow travava até
 * timeout.
 *
 * Este helper:
 *   1. Inicia o loopback server (porta dinâmica por default).
 *   2. Lê `server.url` (com porta real) e injeta como `redirectUri`.
 *   3. Adapta `LoopbackServer.wait()` em `OAuthCallbackHandler.waitFor()`.
 *   4. Chama `performOAuth` com a config completa.
 *   5. Garante `server.close()` no finally.
 */
export async function performOAuthLoopback(
  input: PerformOAuthLoopbackInput,
): Promise<Result<OAuthTokens, OAuthError>> {
  const callbackPath = input.callbackPath ?? '/callback';
  const port = input.port ?? 0;
  const timeoutMs = input.timeoutMs;

  let server: LoopbackServer;
  try {
    server = await startLoopbackServer({
      port,
      pathname: callbackPath,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      autoClose: true,
    });
  } catch (cause) {
    return err(
      OAuthError.exchangeFailed(
        `loopback server failed to bind: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
    );
  }

  try {
    const fullConfig: OAuthConfig = {
      ...input.config,
      redirectUri: server.url,
    };
    const pkce = generatePkce();
    const state = generateState();
    const authUrl = buildAuthUrl({ config: fullConfig, state, pkce });
    await input.openBrowser(authUrl);
    let params: URLSearchParams;
    try {
      params = await server.wait();
    } catch (cause) {
      return err(
        OAuthError.exchangeFailed(
          `loopback wait failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      );
    }
    // RFC 6749 §4.1.2.1: mesma verificação do `performOAuth` — IdP pode
    // redirecionar com `error=access_denied` para o loopback server.
    const providerError = params.get('error');
    if (providerError) {
      const description = params.get('error_description') ?? undefined;
      return err(OAuthError.providerDenied(providerError, description));
    }
    const code = params.get('code');
    if (!code) return err(OAuthError.noCode());
    const returnedState = params.get('state');
    if (returnedState !== state) return err(OAuthError.stateMismatch());
    return await input.exchanger.exchange({
      code,
      codeVerifier: pkce.verifier,
      config: fullConfig,
    });
  } finally {
    await server.close().catch(() => undefined);
  }
}

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function parseTokenPayload(payload: TokenPayload): Result<OAuthTokens, OAuthError> {
  // Validação defensiva: alguns IdPs malcomportados retornam HTTP 200 com
  // `access_token` vazio/whitespace ou `expires_in` zero/negativo. Sem
  // este guard, o vault persistiria credencial inútil e callers falham
  // depois com "auth failed" genérico.
  if (typeof payload.access_token !== 'string' || payload.access_token.trim().length === 0) {
    return err(OAuthError.exchangeFailed('missing or empty access_token'));
  }
  if (typeof payload.refresh_token === 'string' && payload.refresh_token.trim().length === 0) {
    return err(OAuthError.exchangeFailed('empty refresh_token in response'));
  }
  if (typeof payload.expires_in === 'number' && payload.expires_in <= 0) {
    return err(OAuthError.exchangeFailed(`invalid expires_in: ${payload.expires_in}`));
  }
  // IdPs inconsistentes podem omitir `expires_in`. Sem default,
  // `expiresAt` ficaria undefined e o token nunca expiraria — escapa do
  // RotationOrchestrator. 1h é conservador: força refresh logo, em caso
  // dúvida (inferior ao default ~1h da maioria dos providers).
  const DEFAULT_EXPIRES_IN_SEC = 3600;
  const expiresInSec =
    typeof payload.expires_in === 'number' ? payload.expires_in : DEFAULT_EXPIRES_IN_SEC;
  const expiresAt = Date.now() + expiresInSec * 1000;
  const scope =
    typeof payload.scope === 'string' && payload.scope.length > 0 ? payload.scope.split(/\s+/) : [];
  return ok({
    accessToken: payload.access_token,
    ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
    expiresAt,
    tokenType: payload.token_type ?? 'Bearer',
    scope,
  });
}

// Timeout default para troca de tokens. Sem isso, IdP lento/offline
// trava o fluxo OAuth indefinidamente — UI fica em "Conectando..." sem
// recovery automático até o usuário matar/reabrir o app.
const DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS = 30_000;

export function createFetchTokenExchanger(
  fetcher: typeof fetch = fetch,
  options: { readonly timeoutMs?: number } = {},
): TokenExchanger {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS;
  return {
    async exchange({ code, codeVerifier, config }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: codeVerifier,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();
      try {
        const response = await fetcher(config.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: body.toString(),
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return err(OAuthError.exchangeFailed(`HTTP ${response.status}: ${text}`));
        }
        return parseTokenPayload((await response.json()) as TokenPayload);
      } catch (cause) {
        if (controller.signal.aborted) {
          return err(OAuthError.exchangeFailed(`token exchange timed out after ${timeoutMs}ms`));
        }
        return err(OAuthError.exchangeFailed(cause));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
