/**
 * Tasks executadas no pool Piscina (worker thread).
 *
 * Cada função exportada é invocável via `CpuPool.run('<nome>', args)`.
 * Mantemos implementações leves/portáteis para que o pool exista mesmo
 * antes do runtime real de markdown/parsing estar cabeado.
 */

import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

export interface PiscinaTaskArgs {
  readonly args: readonly unknown[];
}

export async function parseJsonlFile(args: PiscinaTaskArgs): Promise<unknown[]> {
  const filePath = pickString(args, 0, 'parseJsonlFile requires filePath');
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line) as unknown);
}

export async function renderMarkdownBatch(args: PiscinaTaskArgs): Promise<string[]> {
  await Promise.resolve();
  const docs = pickStringArray(args, 0, 'renderMarkdownBatch requires docs[]');
  return docs.map((doc) => doc);
}

export async function compressBuffer(args: PiscinaTaskArgs): Promise<Uint8Array> {
  await Promise.resolve();
  const raw = args.args[0];
  if (typeof raw !== 'string' && !(raw instanceof Uint8Array)) {
    throw new TypeError('compressBuffer requires string or Uint8Array');
  }
  const input = typeof raw === 'string' ? Buffer.from(raw, 'utf-8') : Buffer.from(raw);
  return new Uint8Array(gzipSync(input));
}

function pickString(args: PiscinaTaskArgs, index: number, message: string): string {
  const value = args.args[index];
  if (typeof value !== 'string') throw new TypeError(message);
  return value;
}

function pickStringArray(args: PiscinaTaskArgs, index: number, message: string): string[] {
  const value = args.args[index];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError(message);
  }
  return [...(value as string[])];
}
