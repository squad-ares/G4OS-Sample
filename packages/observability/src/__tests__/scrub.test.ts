import { describe, expect, it } from 'vitest';
import { SCRUB_CENSOR, scrubObject, scrubSentryEvent, scrubString } from '../sentry/scrub.ts';

describe('scrubObject', () => {
  it('redacts sensitive keys at any depth', () => {
    const input = {
      user: { email: 'a@b.com', apiKey: 'sk-abc' },
      headers: { authorization: 'Bearer xyz', 'x-api-key': 'k1' },
      nested: { deep: { refresh_token: 'refr-123' } },
      safe: 'keep-me',
    };
    const out = scrubObject(input);
    expect(out.user.email).toBe('a@b.com');
    expect(out.user.apiKey).toBe(SCRUB_CENSOR);
    expect(out.headers.authorization).toBe(SCRUB_CENSOR);
    expect(out.headers['x-api-key']).toBe(SCRUB_CENSOR);
    expect(out.nested.deep.refresh_token).toBe(SCRUB_CENSOR);
    expect(out.safe).toBe('keep-me');
  });

  it('handles arrays', () => {
    const out = scrubObject([
      { token: 't1', name: 'a' },
      { token: 't2', name: 'b' },
    ]);
    expect(out[0]?.token).toBe(SCRUB_CENSOR);
    expect(out[0]?.name).toBe('a');
    expect(out[1]?.token).toBe(SCRUB_CENSOR);
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a['self'] = a;
    const out = scrubObject(a);
    expect(out['name']).toBe('a');
  });

  it('case-insensitive matches (Authorization, COOKIE)', () => {
    const out = scrubObject({ Authorization: 'Bearer x', COOKIE: 'a=b' });
    expect(out.Authorization).toBe(SCRUB_CENSOR);
    expect(out.COOKIE).toBe(SCRUB_CENSOR);
  });
});

describe('scrubString', () => {
  it('redacts OpenAI-style keys', () => {
    const out = scrubString('loaded key sk-abc1234567890_ABCDEFGHIJKL for request');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('sk-abc1234567890');
  });

  it('redacts Google AI keys', () => {
    const out = scrubString('use AIzaSyDfakefakefakefakefakefakefakefake123');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('AIzaSy');
  });

  it('redacts JWT-shaped tokens', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM';
    const out = scrubString(`Bearer ${jwt}`);
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain(jwt);
  });
});

describe('scrubSentryEvent', () => {
  it('cleans contexts, extra, request, tags, message', () => {
    const event = {
      message: 'apiKey sk-abc1234567890_ABCDEFGHIJKL failed',
      contexts: { http: { headers: { authorization: 'Bearer y' } } },
      extra: { password: 'hunter2', safe: 1 },
      request: { headers: { cookie: 'a=b' } },
      tags: { token: 'tk' },
    };
    const out = scrubSentryEvent(event);
    expect(out.message).not.toContain('sk-abc1234567890');
    expect(
      (out.contexts?.['http'] as { headers: { authorization: string } }).headers.authorization,
    ).toBe(SCRUB_CENSOR);
    expect(out.extra?.['password']).toBe(SCRUB_CENSOR);
    expect(out.extra?.['safe']).toBe(1);
    expect((out.request?.['headers'] as { cookie: string }).cookie).toBe(SCRUB_CENSOR);
    expect(out.tags?.['token']).toBe(SCRUB_CENSOR);
  });

  it('is a pure function (does not mutate input)', () => {
    const event = { extra: { apiKey: 'sk-abc1234567890_ABCDEFGHIJKL' } };
    const original = JSON.stringify(event);
    scrubSentryEvent(event);
    expect(JSON.stringify(event)).toBe(original);
  });
});
