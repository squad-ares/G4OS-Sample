#!/usr/bin/env tsx
// CLAUDE.md "Hover/focus em ícone-button (a11y + dark mode)":
// `hover:bg-foreground/N` (N entre 1-15) tem contraste duvidoso em dark mode
// (foreground branco + opacidade baixa = cinza médio sobre fundo escuro).
// Padrão aprovado: `hover:bg-accent/12` ou `hover:bg-accent/15`.
//
// Esta gate falha se um arquivo de feature/renderer reintroduz
// `hover:bg-foreground/N` para N <= 30.

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const SCAN_GLOBS = [
  'packages/features/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
  'apps/desktop/src/renderer/**/*.{ts,tsx}',
];

const ALLOW_HIGH_OPACITY = /\bhover:bg-foreground\/(?:90|95|100)\b/;
// Cobre tanto literal opacity (`/N`) quanto Tailwind arbitrary values com
// decimal (`/[0.0X]`). CR5-12: arbitrary values com decimal escapavam o
// gate antigo, permitindo regressão de contraste em dark mode.
const FORBIDDEN_LITERAL = /\bhover:bg-foreground\/([1-9]|[12][0-9]|30)\b/;
const FORBIDDEN_ARBITRARY = /\bhover:bg-foreground\/\[0\.[0-9]+\]/;
const FORBIDDEN = new RegExp(`(${FORBIDDEN_LITERAL.source})|(${FORBIDDEN_ARBITRARY.source})`);

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

const files = new Set<string>();
for (const pattern of SCAN_GLOBS) {
  for (const f of globSync(pattern, { ignore: ['**/node_modules/**', '**/dist/**'] })) {
    files.add(f);
  }
}

const violations: Violation[] = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    if (FORBIDDEN.test(raw) && !ALLOW_HIGH_OPACITY.test(raw)) {
      violations.push({ file, line: i + 1, snippet: raw.trim().slice(0, 140) });
    }
  }
}

if (violations.length > 0) {
  console.error(`\n- ${violations.length} legacy hover pattern violations:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.snippet}`);
  }
  console.error(
    `\nUse hover:bg-accent/12 (densidade leve) ou hover:bg-accent/15 (média). Filled buttons podem usar hover:bg-foreground/90.\n`,
  );
  process.exit(1);
}

console.log(`[OK] Scanned ${files.size} files; no legacy hover:bg-foreground/N (low opacity)`);
