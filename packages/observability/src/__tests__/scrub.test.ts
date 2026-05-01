import { describe, expect, it } from 'vitest';
import { SCRUB_CENSOR, scrubObject, scrubSentryEvent, scrubString } from '../sentry/scrub.ts';

describe('scrubObject', () => {
  it('redacts sensitive keys at any depth', () => {
    const input = {
      user: { name: 'Alice', apiKey: 'sk-abc' },
      headers: { authorization: 'Bearer xyz', 'x-api-key': 'k1' },
      nested: { deep: { refresh_token: 'refr-123' } },
      safe: 'keep-me',
    };
    const out = scrubObject(input);
    expect(out.user.name).toBe('Alice');
    expect(out.user.apiKey).toBe(SCRUB_CENSOR);
    expect(out.headers.authorization).toBe(SCRUB_CENSOR);
    expect(out.headers['x-api-key']).toBe(SCRUB_CENSOR);
    expect(out.nested.deep.refresh_token).toBe(SCRUB_CENSOR);
    expect(out.safe).toBe('keep-me');
  });

  it('redacts emails embedded in string values (PII)', () => {
    const out = scrubObject({ note: 'message from user@example.com received' });
    expect(out.note).not.toContain('user@example.com');
    expect(out.note).toContain(SCRUB_CENSOR);
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

  // CR6-03 — antes do fix, a segunda visita do mesmo objeto retornava o
  // ORIGINAL não-scrubado. Sentry vazava PII quando dois ramos de um event
  // referenciavam o mesmo payload.
  it('redacts shared subgraphs in BOTH paths (CR6-03)', () => {
    const shared: Record<string, unknown> = { token: 'sk-leak1234567890_ABCDEFGHIJKL' };
    const out = scrubObject({ a: shared, b: { nested: shared } }) as {
      a: { token: unknown };
      b: { nested: { token: unknown } };
    };
    expect(out.a.token).toBe(SCRUB_CENSOR);
    expect(out.b.nested.token).toBe(SCRUB_CENSOR);
    // Mesma referência scrubada em ambos os caminhos (não duas cópias diferentes).
    expect(out.a).toBe(out.b.nested);
  });

  // CR-18 F-O4: `Object.isFrozen(input)` retorna sentinel `[REDACTED]`
  // inteiro. Test garante que isso permanece (configs `as const` em
  // runtime são frequentemente frozen — devem ser scrubadas conservadoramente).
  it('replaces frozen objects with REDACTED sentinel (F-O4)', () => {
    const frozen = Object.freeze({ token: 'sk-secret', user: 'jane@example.com' });
    const result = scrubObject(frozen) as unknown;
    expect(result).toBe(SCRUB_CENSOR);
  });

  it('preserves cycle structure with both nodes scrubbed (CR6-03)', () => {
    const a: Record<string, unknown> = { token: 'tk-leak', name: 'a' };
    a['self'] = a;
    const out = scrubObject(a) as { token: unknown; self: unknown };
    expect(out.token).toBe(SCRUB_CENSOR);
    // Ciclo preservado mas via cópia, não o original.
    expect(out.self).toBe(out);
    expect(out.self).not.toBe(a);
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

  // CR-18 F-O1: tokens opacos não-JWT vazavam pelo debug ZIP via texto
  // bruto (logs JSONL passam pelo scrubString sem visibilidade de chave).
  it('redacts GitHub PAT/OAuth tokens (gh[oprsu]_)', () => {
    const out = scrubString('Authorization: token gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1');
  });

  it('redacts Slack tokens (xox[abprs]-)', () => {
    const out = scrubString('webhook payload "token":"xoxb-1234-567-AAAAAAAAAAAA"');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('xoxb-1234-567');
  });

  it('redacts Notion-style opaque secrets (secret_)', () => {
    const out = scrubString('integration secret_AAAAAAAAAAAAAAAAAAAAAAAA1234');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('secret_AAAAAAAAAAAAAAAAAAAAAAAA1234');
  });

  it('redacts Bearer/Basic in arbitrary log text', () => {
    const out = scrubString('curl -H "Authorization: Bearer ABCdef123_-=/abcdefghij"');
    expect(out).toContain(SCRUB_CENSOR);
    expect(out).not.toContain('Bearer ABCdef123_-=/abcdefghij');
    const out2 = scrubString('http GET / Authorization: Basic dXNlcjpwYXNzd29yZA==');
    expect(out2).toContain(SCRUB_CENSOR);
    expect(out2).not.toContain('Basic dXNlcjpwYXNzd29yZA==');
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

  it('scrubs exception value with email', () => {
    const event = {
      exception: {
        values: [{ type: 'Error', value: 'Failed login for user user@example.com' }],
      },
    };
    const out = scrubSentryEvent(event);
    expect(out.exception?.values?.[0]?.value).not.toContain('user@example.com');
    expect(out.exception?.values?.[0]?.value).toContain(SCRUB_CENSOR);
  });

  it('scrubs exception stack frame vars', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: {
              frames: [
                {
                  vars: { token: 'sk-abc1234567890_ABCDEFGHIJKL', other: 'safe' },
                  abs_path: '/Users/igor/.g4os/credentials.enc',
                },
              ],
            },
          },
        ],
      },
    };
    const out = scrubSentryEvent(event);
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.vars?.['token']).toBe(SCRUB_CENSOR);
    expect(frame?.vars?.['other']).toBe('safe');
    expect(frame?.abs_path).not.toContain('/Users/igor');
  });

  it('redacts home dir paths via scrubString', () => {
    expect(scrubString('open /Users/igor/.g4os/file.json failed')).not.toContain('/Users/igor');
    expect(scrubString('open /home/igor/.config/foo failed')).not.toContain('/home/igor');
    expect(scrubString('C:\\Users\\Igor\\AppData\\Roaming')).not.toContain('Igor');
  });

  it('scrubs exception.mechanism.data (CR4-06)', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'failed',
            mechanism: {
              type: 'generic',
              handled: false,
              synthetic: false,
              data: {
                user_email: 'user@example.com',
                api_token: 'sk-abc1234567890_ABCDEFGHIJKL',
                safe_field: 'keep-me',
              },
            },
          },
        ],
      },
    };
    const out = scrubSentryEvent(event);
    const mech = out.exception?.values?.[0]?.mechanism;
    expect(mech?.handled).toBe(false);
    expect(mech?.synthetic).toBe(false);
    expect(mech?.data?.['user_email']).not.toBe('user@example.com');
    expect(mech?.data?.['api_token']).toBe(SCRUB_CENSOR);
    expect(mech?.data?.['safe_field']).toBe('keep-me');
  });
});
