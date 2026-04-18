#!/usr/bin/env tsx
/**
 * Valida os `exports` de cada pacote publicável via @arethetypeswrong/cli.
 *
 * Durante a fase de scaffolding os pacotes são `private: true` e expõem
 * código-fonte TypeScript diretamente (sem build) para uso intra-workspace.
 * O attw só faz sentido para pacotes publicáveis com artefato `dist/`,
 * por isso este wrapper:
 *
 * 1. Ignora pacotes com `private: true` (não publicáveis).
 * 2. Roda o attw apenas em pacotes públicos com `dist/index.js` presente.
 * 3. Sai 0 sem pacotes-alvo (CI-friendly durante scaffolding).
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packagesDir = path.join(repoRoot, 'packages');

const pkgDirs = readdirSync(packagesDir)
  .map((name) => path.join(packagesDir, name))
  .filter((dir) => existsSync(path.join(dir, 'package.json')));

const targets: string[] = [];
for (const dir of pkgDirs) {
  const pkgJsonPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    name: string;
    private?: boolean;
  };

  if (pkg.private === true) {
    console.log(`[skip] ${pkg.name}: private (não publicável, scaffolding)`);
    continue;
  }

  const distEntry = path.join(dir, 'dist', 'index.js');
  if (!existsSync(distEntry)) {
    console.log(`[skip] ${pkg.name}: sem dist/ (scaffolding ou build pendente)`);
    continue;
  }

  targets.push(dir);
}

if (targets.length === 0) {
  console.log('[ok] Nenhum pacote com artefato publicável. Nada a validar.');
  process.exit(0);
}

let failed = 0;
for (const dir of targets) {
  try {
    execSync('attw --pack . --ignore-rules cjs-resolves-to-esm', {
      cwd: dir,
      stdio: 'inherit',
    });
  } catch {
    failed += 1;
  }
}

process.exit(failed > 0 ? 1 : 0);
