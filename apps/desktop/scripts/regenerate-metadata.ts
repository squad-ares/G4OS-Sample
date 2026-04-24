#!/usr/bin/env tsx
/**
 * Regenera latest.yml + .blockmap para refletir hash do instalador assinado.
 * Necessário quando o sign acontece POST build (V2 evita dual-sign).
 *
 * electron-updater valida sha512 do arquivo contra o declarado em latest.yml.
 * Se a gente assina depois de gerar o yml, o hash diverge → updater recusa.
 *
 * Uso: tsx scripts/regenerate-metadata.ts <release-dir>
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

async function main(): Promise<void> {
  const releaseDir = process.argv[2];
  if (!releaseDir) {
    console.error('usage: regenerate-metadata.ts <release-dir>');
    process.exit(1);
  }

  const entries = await readdir(releaseDir);
  const ymls = entries.filter((e) => e.startsWith('latest') && e.endsWith('.yml'));

  if (ymls.length === 0) {
    console.log('[regen-metadata] no latest*.yml found — nothing to do');
    return;
  }

  for (const yml of ymls) {
    const ymlPath = join(releaseDir, yml);
    console.log(`[regen-metadata] updating ${yml}`);
    await updateLatestYml(ymlPath, releaseDir);
  }

  console.log('[regen-metadata] done');
}

async function updateLatestYml(ymlPath: string, releaseDir: string): Promise<void> {
  const content = await readFile(ymlPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const updated: string[] = [];

  // Parse simples linha-a-linha — electron-updater latest.yml tem formato
  // previsível (não full YAML). Substituímos hashes/sizes inline.

  let currentFile: string | null = null;
  for (const rawLine of lines) {
    const line = rawLine;

    const urlMatch = line.match(/^\s*-?\s*url:\s*(.+?)\s*$/);
    if (urlMatch) {
      currentFile = urlMatch[1]!;
      updated.push(line);
      continue;
    }

    if (currentFile && line.match(/^\s+sha512:/)) {
      const fullPath = join(releaseDir, currentFile);
      try {
        const sha = await sha512Base64(fullPath);
        const indent = line.match(/^\s+/)?.[0] ?? '  ';
        updated.push(`${indent}sha512: ${sha}`);
      } catch {
        updated.push(line);
      }
      continue;
    }

    if (currentFile && line.match(/^\s+size:/)) {
      const fullPath = join(releaseDir, currentFile);
      try {
        const { size } = await stat(fullPath);
        const indent = line.match(/^\s+/)?.[0] ?? '  ';
        updated.push(`${indent}size: ${size}`);
      } catch {
        updated.push(line);
      }
      continue;
    }

    // Campos top-level sha512/path (single-file yml)
    if (line.match(/^sha512:/)) {
      // pegar `path` já capturado para calcular
      const pathLine = lines.find((l) => l.startsWith('path:'));
      const path = pathLine?.split(':').slice(1).join(':').trim();
      if (path) {
        try {
          const sha = await sha512Base64(join(releaseDir, path));
          updated.push(`sha512: ${sha}`);
          continue;
        } catch {
          // fall through
        }
      }
    }

    updated.push(line);
  }

  await writeFile(ymlPath, updated.join('\n'), 'utf-8');
}

async function sha512Base64(path: string): Promise<string> {
  const hash = createHash('sha512');
  await pipeline(createReadStream(path), hash);
  return hash.digest('base64');
}

main().catch((err) => {
  console.error('[regen-metadata] fatal:', err);
  process.exit(1);
});
