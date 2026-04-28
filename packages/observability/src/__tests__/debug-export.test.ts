import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportDebugInfo, readTextFromZip } from '../debug/index.ts';
import { createMetrics } from '../metrics/index.ts';

describe('exportDebugInfo', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'g4os-debug-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('produces a zip containing system, config, metrics and logs', async () => {
    const logsDir = join(workDir, 'logs');
    await writeFile(join(workDir, 'placeholder.txt'), 'x');
    await import('node:fs/promises').then((m) => m.mkdir(logsDir, { recursive: true }));
    await writeFile(join(logsDir, 'app.log'), 'hello world\n');

    const output = join(workDir, 'debug.zip');
    const metrics = createMetrics({ includeDefaults: false });
    metrics.sessionActive.set(2);

    const result = await exportDebugInfo({
      outputPath: output,
      systemInfo: {
        app: { name: 'G4 OS', version: '0.0.0' },
        platform: { os: process.platform, arch: process.arch, nodeVersion: process.version },
      },
      config: { username: 'igor', workingDirectory: '/tmp/work' },
      logsDir,
      metrics,
    });

    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.entries).toContain('system.json');
    expect(result.entries).toContain('config.json');
    expect(result.entries).toContain('metrics.prom');
    expect(result.entries).toContain('logs/app.log');
  });

  it('redacts secrets embedded in config and logs', async () => {
    const logsDir = join(workDir, 'logs');
    await import('node:fs/promises').then((m) => m.mkdir(logsDir, { recursive: true }));
    await writeFile(
      join(logsDir, 'session.log'),
      'auth header: Bearer sk-ant-SECRET12345678901234567890\n',
    );

    const output = join(workDir, 'debug.zip');
    const metrics = createMetrics({ includeDefaults: false });
    await exportDebugInfo({
      outputPath: output,
      systemInfo: {
        app: { name: 'G4 OS', version: '0.0.0' },
        platform: { os: process.platform, arch: process.arch, nodeVersion: process.version },
      },
      config: {
        apiKey: 'sk-ant-VERYSECRET1234567890',
        nested: { token: 'eyJabc.def.ghi', safeValue: 42 },
      },
      logsDir,
      metrics,
    });

    const raw = await readTextFromZip(output);
    expect(raw).not.toContain('sk-ant-VERYSECRET1234567890');
    expect(raw).not.toContain('sk-ant-SECRET12345678901234567890');
    expect(raw).not.toContain('eyJabc.def.ghi');
  });
});
