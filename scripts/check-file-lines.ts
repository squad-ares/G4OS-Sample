#!/usr/bin/env tsx
// Verifica que nenhum arquivo excede limite de linhas
import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAX_LINES = 500;
const EXEMPTIONS: Set<string> = new Set([
  // Arquivos gerados ou auto-documentados podem ser excluídos
  // ex: 'packages/kernel/src/generated-types.ts'

  // Arquivos de locale crescem linearmente com o produto e não podem ser
  // divididos sem mudanças arquiteturais no sistema i18n.
  'packages/translate/src/locales/en-us.ts',
  'packages/translate/src/locales/pt-br.ts',
]);

const files = globSync('**/src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/*.generated.ts'],
});

const violations: Array<{ file: string; lines: number }> = [];

for (const file of files) {
  if (EXEMPTIONS.has(file)) continue;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  if (lines > MAX_LINES) {
    violations.push({ file, lines });
  }
}

if (violations.length > 0) {
  console.error(`\n- ${violations.length} files exceed ${MAX_LINES} lines:\n`);
  for (const { file, lines } of violations) {
    console.error(`  ${file}: ${lines} lines`);
  }
  console.error(
    `\nSplit into smaller modules. If legitimate, add to EXEMPTIONS with ADR justification.\n`,
  );
  process.exit(1);
}

console.log(`[OK] All ${files.length} files under ${MAX_LINES} lines`);
