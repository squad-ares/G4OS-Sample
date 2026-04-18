#!/usr/bin/env tsx
/**
 * Gate de bundle-size via size-limit.
 *
 * Durante a fase de scaffolding os pacotes ainda não produzem artefatos
 * `dist/` e não há preset de `size-limit` instalado. Este wrapper:
 *
 * 1. Sai 0 quando nenhum pacote tem `dist/` (fase atual).
 * 2. Delega para `size-limit` quando houver preset e artefato a medir.
 *
 * O preset (ex.: `@size-limit/preset-big-lib`) deve ser adicionado junto
 * com a primeira checagem real, na mesma task que publicar o pacote.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packagesDir = path.join(repoRoot, 'packages');

const hasAnyDist = readdirSync(packagesDir).some((name) =>
  existsSync(path.join(packagesDir, name, 'dist', 'index.js')),
);

const presetInstalled =
  existsSync(path.join(repoRoot, 'node_modules', '@size-limit', 'preset-big-lib')) ||
  existsSync(path.join(repoRoot, 'node_modules', '@size-limit', 'preset-app')) ||
  existsSync(path.join(repoRoot, 'node_modules', '@size-limit', 'preset-small-lib'));

if (!hasAnyDist || !presetInstalled) {
  const reason = hasAnyDist
    ? 'Preset de size-limit ainda não instalado'
    : 'Nenhum pacote com dist/';
  console.log(`[ok] ${reason}. size-limit ignorado durante scaffolding.`);
  process.exit(0);
}

const sizeLimitBin = path.join(repoRoot, 'node_modules', '.bin', 'size-limit');
try {
  execSync(sizeLimitBin, { cwd: repoRoot, stdio: 'inherit' });
} catch {
  process.exit(1);
}
