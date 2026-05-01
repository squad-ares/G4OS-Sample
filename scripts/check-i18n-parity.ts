#!/usr/bin/env tsx
/**
 * Gate de paridade entre locales: garante que `pt-BR` e `en-US` têm
 * exatamente o mesmo conjunto de chaves. Drift é detectado em <100ms via
 * regex parsing (sem TS compile), pra rodar em `pnpm lint`.
 *
 * O `translate.test.ts` faz a mesma checagem mas roda dentro do vitest
 * (lento). Esse gate replica como linter pra falhar PR antes do test
 * rodar — feedback mais rápido.
 *
 * 10c-29 + 10c-30: snapshot parity + CI gate em lint.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'packages/translate/src/locales';
const PT_PATH = join(ROOT, 'pt-br.ts');
const EN_PATH = join(ROOT, 'en-us.ts');

function extractKeys(filePath: string): readonly string[] {
  const content = readFileSync(filePath, 'utf-8');
  const matches = content.match(/^\s*'([^']+)':/gm) ?? [];
  return matches
    .map((m) => {
      const k = m.match(/'([^']+)'/);
      return k?.[1] ?? '';
    })
    .filter((k) => k.length > 0);
}

const ptKeys = new Set(extractKeys(PT_PATH));
const enKeys = new Set(extractKeys(EN_PATH));

const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));

if (missingInEn.length === 0 && missingInPt.length === 0) {
  console.log(`[OK] ${ptKeys.size} translation keys in parity (pt-BR ↔ en-US)`);
  process.exit(0);
}

if (missingInEn.length > 0) {
  console.error(`\n[FAIL] ${missingInEn.length} keys exist in pt-BR but missing in en-US:`);
  for (const k of missingInEn.slice(0, 20)) console.error(`  - ${k}`);
  if (missingInEn.length > 20) console.error(`  ... ${missingInEn.length - 20} more`);
}

if (missingInPt.length > 0) {
  console.error(`\n[FAIL] ${missingInPt.length} keys exist in en-US but missing in pt-BR:`);
  for (const k of missingInPt.slice(0, 20)) console.error(`  - ${k}`);
  if (missingInPt.length > 20) console.error(`  ... ${missingInPt.length - 20} more`);
}

process.exit(1);
