import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_CENSOR, REDACT_PATHS, wrapPinoLogger } from '../logger.ts';
import { createProductionTransport } from '../transport.ts';

function captureStream(): { getLines: () => string[]; write: (chunk: string) => void } {
  const lines: string[] = [];
  return {
    getLines: () => lines,
    write: (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim().length > 0) lines.push(line);
      }
    },
  };
}

describe('logger redaction', () => {
  it('redacts api keys via wrapped logger', () => {
    const stream = captureStream();
    const inner = pino(
      {
        level: 'info',
        redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
        formatters: { level: (label) => ({ level: label }) },
      },
      { write: (chunk) => stream.write(chunk) },
    );
    const log = wrapPinoLogger(inner);

    log.info({ apiKey: 'sk-secret-123', token: 'tok-abc', nested: { password: 'p@ss' } }, 'test');

    const line = stream.getLines()[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string) as Record<string, unknown>;
    expect(parsed['apiKey']).toBe(REDACT_CENSOR);
    expect(parsed['token']).toBe(REDACT_CENSOR);
    expect((parsed['nested'] as Record<string, unknown>)['password']).toBe(REDACT_CENSOR);
    expect(line).not.toContain('sk-secret-123');
    expect(line).not.toContain('p@ss');
  });

  it('redacts authorization + cookie headers', () => {
    const stream = captureStream();
    const inner = pino(
      {
        level: 'info',
        redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
        formatters: { level: (label) => ({ level: label }) },
      },
      { write: (chunk) => stream.write(chunk) },
    );
    wrapPinoLogger(inner).info(
      { headers: { authorization: 'Bearer xyz', cookie: 'session=abc' } },
      'req',
    );

    const line = stream.getLines()[0];
    expect(line).not.toContain('Bearer xyz');
    expect(line).not.toContain('session=abc');
  });
});

describe('createProductionTransport', () => {
  it('emits app.log and error.log targets with daily rotation defaults', () => {
    const transport = createProductionTransport({ logsDir: '/tmp/g4-logs' });
    expect(transport.targets).toHaveLength(2);
    const [app, err] = transport.targets;
    expect(app?.target).toBe('pino-roll');
    expect(app?.level).toBe('info');
    expect(app?.options['file']).toBe('/tmp/g4-logs/app.log');
    expect(app?.options['frequency']).toBe('daily');
    expect(app?.options['size']).toBe('100M');
    expect(app?.options['limit']).toEqual({ count: 7 });
    expect(err?.level).toBe('error');
    expect(err?.options['file']).toBe('/tmp/g4-logs/error.log');
  });

  it('honors overrides', () => {
    const transport = createProductionTransport({
      logsDir: '/logs',
      frequency: 'hourly',
      maxSize: '50M',
      historyCount: 3,
    });
    const app = transport.targets[0];
    expect(app?.options['frequency']).toBe('hourly');
    expect(app?.options['size']).toBe('50M');
    expect(app?.options['limit']).toEqual({ count: 3 });
  });
});

describe('REDACT_PATHS coverage', () => {
  it('covers root, 1-level and 2-level nested sensitive keys', () => {
    expect(REDACT_PATHS).toContain('apiKey');
    expect(REDACT_PATHS).toContain('*.apiKey');
    expect(REDACT_PATHS).toContain('*.*.apiKey');
    expect(REDACT_PATHS).toContain('authorization');
    expect(REDACT_PATHS).toContain('*.authorization');
  });
});
