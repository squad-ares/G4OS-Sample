#!/usr/bin/env tsx
/**
 * Gate: total de LOC em `apps/desktop/src/main/` < MAIN_LIMIT (2000),
 * com cada arquivo ≤ FILE_LIMIT (300). Falha o build se estourar.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAIN_LIMIT = 2000;
const FILE_LIMIT = 300;

const files = globSync('apps/desktop/src/main/**/*.ts', {
  ignore: ['**/__tests__/**', '**/*.test.ts'],
});

let total = 0;
const oversized: Array<{ file: string; lines: number }> = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  total += lines;
  if (lines > FILE_LIMIT) oversized.push({ file, lines });
}

let failed = false;

if (oversized.length > 0) {
  console.error(`\n- ${oversized.length} main files exceed ${FILE_LIMIT} lines:\n`);
  for (const { file, lines } of oversized) console.error(`  ${file}: ${lines}`);
  failed = true;
}

if (total > MAIN_LIMIT) {
  console.error(`\nmain process total LOC: ${total} > ${MAIN_LIMIT}`);
  failed = true;
}

if (failed) process.exit(1);

console.log(`[OK] main process LOC: ${total} / ${MAIN_LIMIT} (files: ${files.length})`);
