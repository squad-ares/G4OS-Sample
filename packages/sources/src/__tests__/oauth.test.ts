import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { OAuthCallbackHandler } from '../oauth/callback-handler.ts';
import { buildAuthUrl, createFetchTokenExchanger, performOAuth } from '../oauth/flow.ts';
import { generatePkce, generateState } from '../oauth/pkce.ts';
import type { OAuthConfig, OAuthTokens, TokenExchanger } from '../oauth/types.ts';

const config: OAuthConfig = {
  clientId: 'client-abc',
  authorizationEndpoint: 'https://auth.example.com/authorize',
  tokenEndpoint: 'https://auth.example.com/token',
  redirectUri: 'g4os://oauth/callback',
  scopes: ['read', 'write'],
};

describe('PKCE', () => {
  it('generates a verifier + challenge pair with S256', () => {
    const pkce = generatePkce();
    expect(pkce.method).toBe('S256');
    expect(pkce.verifier.length).toBeGreaterThan(32);
    expect(pkce.challenge.length).toBeGreaterThan(32);
    expect(pkce.verifier).not.toBe(pkce.challenge);
  });

  it('state generator produces unique values', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('buildAuthUrl', () => {
  it('includes required OAuth params', () => {
    const pkce = generatePkce();
    const state = 'state-xyz';
    const url = new URL(buildAuthUrl({ config, state, pkce }));
    expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('read write');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('OAuthCallbackHandler', () => {
  it('resolves pending waiter via deep link', async () => {
    const handler = new OAuthCallbackHandler();
    const waiter = handler.waitFor('abc');
    const accepted = handler.handleDeepLink('g4os://oauth/callback?code=xyz&state=abc');
    expect(accepted).toBe(true);
    const params = await waiter;
    expect(params._unsafeUnwrap().get('code')).toBe('xyz');
    handler.dispose();
  });

  it('ignores unrelated protocols', () => {
    const handler = new OAuthCallbackHandler();
    expect(handler.handleDeepLink('https://example.com/?state=x')).toBe(false);
    handler.dispose();
  });

  it('times out when no callback arrives', async () => {
    const handler = new OAuthCallbackHandler();
    const result = await handler.waitFor('pending', 10);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('callback_timeout');
    handler.dispose();
  });
});

describe('performOAuth', () => {
  it('runs full flow and returns tokens', async () => {
    const handler = new OAuthCallbackHandler();
    const tokens: OAuthTokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      scope: ['read', 'write'],
    };
    const exchanger: TokenExchanger = {
      exchange: vi.fn(async () => ok(tokens)),
    };
    const openBrowser = vi.fn((url: string) => {
      const parsed = new URL(url);
      const state = parsed.searchParams.get('state');
      if (state) {
        handler.handleParams(new URLSearchParams({ state, code: 'code-1' }));
      }
    });

    const result = await performOAuth({
      config,
      callbackHandler: handler,
      exchanger,
      openBrowser,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(tokens);
    expect(openBrowser).toHaveBeenCalled();
    handler.dispose();
  });

  it('times out cleanly when no callback comes', async () => {
    const handler = new OAuthCallbackHandler({ defaultTimeoutMs: 10 });
    const exchanger: TokenExchanger = {
      exchange: vi.fn(async () => ok({ accessToken: '', tokenType: 'Bearer', scope: [] })),
    };
    const openBrowser = vi.fn();
    const result = await performOAuth({
      config,
      callbackHandler: handler,
      exchanger,
      openBrowser,
      timeoutMs: 10,
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('callback_timeout');
    handler.dispose();
  });
});

describe('createFetchTokenExchanger (token payload validation)', () => {
  function exchangeWithPayload(payload: unknown) {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => '',
    })) as unknown as typeof fetch;
    const exchanger = createFetchTokenExchanger(fetcher);
    return exchanger.exchange({ code: 'c', codeVerifier: 'v', config });
  }

  it('rejects empty access_token', async () => {
    const result = await exchangeWithPayload({ access_token: '' });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('exchange_failed');
  });

  it('rejects whitespace-only access_token', async () => {
    const result = await exchangeWithPayload({ access_token: '   ' });
    expect(result.isErr()).toBe(true);
  });

  it('rejects empty refresh_token in present payload', async () => {
    const result = await exchangeWithPayload({ access_token: 'good', refresh_token: '' });
    expect(result.isErr()).toBe(true);
  });

  it('rejects expires_in <= 0', async () => {
    const result = await exchangeWithPayload({ access_token: 'good', expires_in: 0 });
    expect(result.isErr()).toBe(true);
  });

  it('accepts well-formed payload', async () => {
    const result = await exchangeWithPayload({
      access_token: 'good',
      refresh_token: 'r',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'read write',
    });
    expect(result.isOk()).toBe(true);
    const tokens = result._unsafeUnwrap();
    expect(tokens.accessToken).toBe('good');
    expect(tokens.refreshToken).toBe('r');
    expect(tokens.scope).toEqual(['read', 'write']);
  });
});
