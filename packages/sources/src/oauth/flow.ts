import { err, ok, type Result } from 'neverthrow';
import type { OAuthCallbackHandler } from './callback-handler.ts';
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

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function parseTokenPayload(payload: TokenPayload): Result<OAuthTokens, OAuthError> {
  if (!payload.access_token) {
    return err(OAuthError.exchangeFailed('missing access_token'));
  }
  const expiresAt =
    typeof payload.expires_in === 'number' ? Date.now() + payload.expires_in * 1000 : undefined;
  const scope =
    typeof payload.scope === 'string' && payload.scope.length > 0 ? payload.scope.split(/\s+/) : [];
  return ok({
    accessToken: payload.access_token,
    ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    tokenType: payload.token_type ?? 'Bearer',
    scope,
  });
}

export function createFetchTokenExchanger(fetcher: typeof fetch = fetch): TokenExchanger {
  return {
    async exchange({ code, codeVerifier, config }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: codeVerifier,
      });

      try {
        const response = await fetcher(config.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: body.toString(),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return err(OAuthError.exchangeFailed(`HTTP ${response.status}: ${text}`));
        }
        return parseTokenPayload((await response.json()) as TokenPayload);
      } catch (cause) {
        return err(OAuthError.exchangeFailed(cause));
      }
    },
  };
}
