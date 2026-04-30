import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { exportMetrics, type G4Metrics, getMetrics } from '../metrics/index.ts';
import { redactSecretsInText, sanitizeConfig } from './redact.ts';

/**
 * Garante que `child` (após resolver symlinks) está dentro de `root`. Previne
 * inclusão acidental de arquivos externos via symlink dentro do logsDir/crashesDir
 * (Information disclosure em debug export compartilhado com support).
 */
async function isInsideRealRoot(child: string, root: string): Promise<boolean> {
  try {
    const realChild = await realpath(child);
    const realRoot = await realpath(root);
    const rootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
    return realChild === realRoot || realChild.startsWith(rootWithSep);
  } catch {
    return false;
  }
}

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

  // Cleanup do ZIP parcial em qualquer falha de write/append.
  // Sem isso, disk-full mid-write deixava arquivo corrompido com extensão
  // .zip em uso pelo support team — diagnóstico ficava ainda mais difícil
  // que sem export. Wrap completo em try/finally que rm() o output se
  // não chegamos ao final OK.
  let succeeded = false;
  try {
    // System.json também passa por sanitizeConfig. systemInfo
    // pode embutir paths absolutos do user (home, userData, sessions),
    // hostname, ou identificadores de máquina — tudo PII se compartilhado
    // em ticket. Antes ia raw, vazando paths em qualquer debug bundle.
    appendJson(archive, 'system.json', sanitizeConfig(options.systemInfo));
    entries.push('system.json');

    appendJson(archive, 'config.json', sanitizeConfig(options.config));
    entries.push('config.json');

    await appendLogs(archive, options, entries);
    await appendMetrics(archive, options, entries);
    await appendCrashes(archive, options, entries);
    appendProcessSnapshot(archive, options, entries);

    await archive.finalize();
    await closed;
    succeeded = true;

    const finalStat = await stat(options.outputPath);
    return { outputPath: options.outputPath, byteLength: finalStat.size, entries };
  } finally {
    if (!succeeded) {
      // best-effort cleanup; se falhou ao escrever, remover .zip parcial
      try {
        const { rm } = await import('node:fs/promises');
        await rm(options.outputPath, { force: true });
      } catch {
        // best-effort
      }
    }
  }
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
    // Rejeita symlinks que escapam de logsDir.
    if (!(await isInsideRealRoot(filePath, options.logsDir))) continue;
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

async function appendCrashes(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): Promise<void> {
  if (!options.crashesDir || !existsSync(options.crashesDir)) return;
  // Itera per-arquivo com `isInsideRealRoot` para rejeitar symlinks
  // que escapam de `crashesDir`. `archive.directory()` não permite filtro
  // per-entry seguro contra path traversal — refator obrigatório.
  const baseDir = options.crashesDir;
  let added = false;
  try {
    const fileNames = await readdir(baseDir);
    for (const name of fileNames) {
      const filePath = join(baseDir, name);
      if (!(await isInsideRealRoot(filePath, baseDir))) continue;
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      // Stack traces de crashes podem conter args com secret
      // (URL com token, headers de auth em fetch frames, env vars
      // capturadas em closure). `archive.file()` empacota raw — passamos
      // pelo redactSecretsInText em vez disso. Crash dumps `.json`/`.dmp`
      // entram raw porque conteúdo é estruturado/binário (Crashpad
      // minidumps); só `.txt`/`.log`/`.stack` passam por scrub.
      const isTextual =
        name.endsWith('.txt') ||
        name.endsWith('.log') ||
        name.endsWith('.stack') ||
        name.endsWith('.crashlog');
      if (isTextual) {
        const raw = await readFile(filePath, 'utf-8');
        archive.append(redactSecretsInText(raw), { name: `crashes/${name}` });
      } else {
        archive.file(filePath, { name: `crashes/${name}` });
      }
      added = true;
    }
  } catch {
    // best-effort; ausência de crashes não é erro
  }
  if (added) entries.push('crashes/');
}

function appendProcessSnapshot(
  archive: archiver.Archiver,
  options: DebugExportOptions,
  entries: string[],
): void {
  if (options.processSnapshot === undefined) return;
  // ProcessSnapshot pode embutir command lines (com tokens em argv),
  // env vars, paths absolutos com username — passa por sanitize igual aos
  // outros payloads. Antes era apendado raw e vazava PII no debug ZIP.
  appendJson(archive, 'processes.json', sanitizeConfig(options.processSnapshot));
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
