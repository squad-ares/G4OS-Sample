#!/usr/bin/env tsx
/**
 * Gate 10c-55 — `as TranslationKey` cast bypass.
 *
 * Hardcoded string literals castados para `TranslationKey` mascaram dois
 * problemas:
 *   (a) Chave existe no locale → cast desnecessário; o tipo já satisfaz.
 *   (b) Chave NÃO existe → cast engana o typechecker e produz miss em runtime.
 *
 * Casts legítimos (permitidos):
 *   - Template literals: `t(\`prefix.${var}\` as TranslationKey)` — TypeScript
 *     perde o literal type; único jeito de tipar corretamente.
 *   - Acesso de propriedade: `t(item.labelKey as TranslationKey)` — quando
 *     a propriedade vive num pacote que não pode depender de @g4os/translate
 *     (ex.: @g4os/kernel). Deve ser minimizado.
 *
 * O que este gate bloqueia:
 *   - `'some.key' as TranslationKey` — string literal hardcoded com cast.
 *   - `"some.key" as TranslationKey` — idem com aspas duplas.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const SCAN_GLOBS = [
  'packages/features/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
  'apps/desktop/src/renderer/**/*.{ts,tsx}',
];

// Matches single-quoted or double-quoted string literal + cast
// Does NOT match template literals (backtick prefix caught by negative lookbehind)
const FORBIDDEN = /(?<![`])\b['"][^'"]+['"]\s+as\s+TranslationKey\b/;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

const files = new Set<string>();
for (const pattern of SCAN_GLOBS) {
  for (const f of globSync(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/__tests__/**'],
  })) {
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
    if (FORBIDDEN.test(raw)) {
      violations.push({ file, line: i + 1, snippet: raw.trim().slice(0, 160) });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `\n${violations.length} hardcoded string 'as TranslationKey' cast(s) encontrados:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.snippet}`);
  }
  console.error(`
Correção: se a chave existe no locale, remova o cast — o tipo já é satisfeito.
Se a chave não existe, adicione-a ao locale (en-us.ts + pt-br.ts).
Para acesso dinâmico via template literal, use: \`prefix.\${var}\` as TranslationKey (permitido).
`);
  process.exit(1);
}

console.log(`[OK] Scanned ${files.size} files; no hardcoded string 'as TranslationKey' casts.`);
