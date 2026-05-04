#!/usr/bin/env tsx
/**
 * Gera SBOM (Software Bill of Materials) no formato CycloneDX JSON,
 * pronto pra anexar em release ou enviar ao auditor (TASK-15-03).
 *
 * Implementação delega ao `@cyclonedx/cyclonedx-npm` via npx — não
 * adicionamos como devDep porque é executável raramente (release +
 * audit prep) e tem 50+ deps transitivas que poluiriam lockfile.
 *
 * Output: `sbom.json` na raiz. Gitignore deveria cobrir (não commitar
 * SBOM — ele é regenerável).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const OUTPUT = 'sbom.json';

if (!existsSync('package.json')) {
  console.error('package.json not found — run from repo root');
  process.exit(2);
}

console.log('[sbom] generating CycloneDX SBOM via npx (network access required)...');

const child = spawn(
  'npx',
  ['--yes', '@cyclonedx/cyclonedx-npm', '--output-file', OUTPUT, '--output-format', 'JSON'],
  { stdio: 'inherit' },
);

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`[OK] SBOM written to ${OUTPUT}`);
    return;
  }
  console.error(`[FAIL] cyclonedx-npm exited ${code}`);
  process.exit(code ?? 1);
});

child.on('error', (cause) => {
  console.error(`[FAIL] failed to spawn npx: ${cause.message}`);
  process.exit(1);
});
