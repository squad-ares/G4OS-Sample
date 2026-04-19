import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { exportMetrics, type G4Metrics, getMetrics } from '../metrics/index.ts';
import { redactSecretsInText, sanitizeConfig } from './redact.ts';

export interface DebugExportSystemInfo {
  readonly app: { readonly name: string; readonly version: string; readonly flavor?: string };
  readonly platform: {
    readonly os: string;
    readonly arch: string;
    readonly nodeVersion: string;
    readonly electronVersion?: string;
    readonly memoryTotalBytes?: number;
    readonly cpus?: number;
  };
  readonly runtime?: Record<string, unknown>;
}

export interface DebugExportOptions {
  readonly outputPath: string;
  readonly systemInfo: DebugExportSystemInfo;
  readonly config: unknown;
  readonly logsDir?: string;
  readonly logsMaxAgeDays?: number;
  readonly crashesDir?: string;
  readonly processSnapshot?: unknown;
  readonly metrics?: G4Metrics;
}

export interface DebugExportResult {
  readonly outputPath: string;
  readonly byteLength: number;
  readonly entries: readonly string[];
}

const DEFAULT_LOG_MAX_AGE_DAYS = 7;
const MAX_LOG_BYTES = 10 * 1024 * 1024;

export async function exportDebugInfo(options: DebugExportOptions): Promise<DebugExportResult> {
  const entries: string[] = [];
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = createWriteStream(options.outputPath);
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);

  appendJson(archive, 'system.json', options.systemInfo);
  entries.push('system.json');

  appendJson(archive, 'config.json', sanitizeConfig(options.config));
  entries.push('config.json');

  await appendLogs(archive, options, entries);
  await appendMetrics(archive, options, entries);
  appendCrashes(archive, options, entries);
  appendProcessSnapshot(archive, options, entries);

  await archive.finalize();
  await closed;

  const finalStat = await stat(options.outputPath);
  return { outputPath: options.outputPath, byteLength: finalStat.size, entries };
}

async function appendLogs(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): Promise<void> {
  if (!options.logsDir || !existsSync(options.logsDir)) return;
  const maxAgeDays = options.logsMaxAgeDays ?? DEFAULT_LOG_MAX_AGE_DAYS;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  for (const file of await readdir(options.logsDir)) {
    if (!file.endsWith('.log') && !file.endsWith('.log.jsonl')) continue;
    const filePath = join(options.logsDir, file);
    const info = await stat(filePath);
    if (info.mtimeMs < cutoff || info.size > MAX_LOG_BYTES) continue;
    const content = await readFile(filePath, 'utf-8');
    const name = `logs/${basename(file)}`;
    archive.append(redactSecretsInText(content), { name });
    entries.push(name);
  }
}

async function appendMetrics(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): Promise<void> {
  const metricsText = await exportMetrics(options.metrics ?? getMetrics());
  archive.append(metricsText, { name: 'metrics.prom' });
  entries.push('metrics.prom');
}

function appendCrashes(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): void {
  if (!options.crashesDir || !existsSync(options.crashesDir)) return;
  archive.directory(options.crashesDir, 'crashes');
  entries.push('crashes/');
}

function appendProcessSnapshot(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): void {
  if (options.processSnapshot === undefined) return;
  appendJson(archive, 'processes.json', options.processSnapshot);
  entries.push('processes.json');
}

function appendJson(archive: archiver.Archiver, name: string, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  const stream = Readable.from(body);
  archive.append(stream, { name });
}

export async function readTextFromZip(zipPath: string): Promise<string> {
  const chunks: Buffer[] = [];
  const stream = createReadStream(zipPath);
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('binary');
}
