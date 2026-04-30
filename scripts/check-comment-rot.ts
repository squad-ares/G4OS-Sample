#!/usr/bin/env tsx
/**
 * Gate 10c-57 — Comment rot detection.
 *
 * Detecta referências a códigos de tracking obsoletos nos comentários:
 *   - `CR<N>-<NN>` (code review rounds)
 *   - `OUTLIER-<NN>` (tarefas suplementares)
 *   - `TASK-<NN>-<NN>` ou `TASK-<NN>` (task IDs de epics)
 *
 * Estes prefixos apodrece à medida que o histórico de desenvolvimento
 * envelhece — referências numéricas sem contexto não ajudam futuros
 * leitores. O gate não bloqueia na quantidade atual; usa um teto que
 * deve ser mantido decrescente à medida que o cleanup progride.
 *
 * MAX_ALLOWED é o teto corrente. Reduza-o conforme os arquivos forem
 * limpos. Para limpar: remova o prefixo `CR7-24:` mas preserve o texto
 * explicativo que segue.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAX_ALLOWED = 0;

const SCAN_GLOBS = ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'];

const IGNORE_FRAGMENTS = ['/__tests__/', '/locales/', '/dist/', 'node_modules', '.snap'];

// Matches: CR7-24, CR12-AU2, OUTLIER-09, TASK-14-01, TASK-10B-13 etc.
const STALE_REF = /\b(CR\d+(?:-\d+)?|OUTLIER-\d+|TASK-\d+(?:[A-Z]?\d*-\d+)*)\b/;

const files = new Set<string>();
for (const pattern of SCAN_GLOBS) {
  for (const f of globSync(pattern, { ignore: ['**/node_modules/**', '**/dist/**'] })) {
    files.add(f);
  }
}

let total = 0;
const violations: { file: string; line: number; snippet: string }[] = [];

for (const file of files) {
  if (IGNORE_FRAGMENTS.some((frag) => file.includes(frag))) continue;

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    // Only check inside comments (lines containing // or *)
    const isCommentLine = /^\s*(\/\/|\*)/.test(raw) || raw.includes('/*') || raw.includes('*/');
    if (!isCommentLine) continue;
    if (STALE_REF.test(raw)) {
      total++;
      if (total <= 10 || total > MAX_ALLOWED) {
        violations.push({ file, line: i + 1, snippet: raw.trim().slice(0, 120) });
      }
    }
  }
}

if (total > MAX_ALLOWED) {
  console.error(`\nComment rot teto excedido: ${total} ocorrências (max ${MAX_ALLOWED})\n`);
  console.error('Primeiras ocorrências em excesso:');
  for (const v of violations.slice(10)) {
    console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(`\nPara corrigir: remova o prefixo (ex. "CR7-24:") preservando o texto WHY.`);
  process.exit(1);
}

const pct = Math.round((total / MAX_ALLOWED) * 100);
console.log(
  `[OK] ${total}/${MAX_ALLOWED} stale comment refs (${pct}% do teto). Para reduzir o teto, limpe arquivos e decremente MAX_ALLOWED.`,
);
