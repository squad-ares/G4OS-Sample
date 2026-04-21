#!/usr/bin/env tsx
/**
 * Gate: total de LOC em `apps/desktop/src/main/` < MAIN_LIMIT, com cada
 * arquivo ≤ FILE_LIMIT. Falha o build se estourar.
 *
 * O orçamento cresceu de 2000 para 3000 em 2026-04-21 junto com o
 * Epic 10b-wiring: main passou a compor de verdade observability,
 * credentials, auth e futuras integrações de data/agents/sources.
 * Adicionar 300–400 LOC em composition root (todos arquivos <300 LOC)
 * é o contrário de "god main process" — é o custo legítimo de amarrar
 * os pacotes ADR-defined. CLAUDE.md precisa refletir esse novo teto.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAIN_LIMIT = 3000;
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
