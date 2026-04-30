#!/usr/bin/env tsx
/**
 * Gate 10c-53 — AbortSignal não propagado em operações críticas.
 *
 * Detecta padrões onde um AbortSignal disponível não é propagado para
 * chamadas de rede ou subprocessos. O problema: se a operação externa
 * nunca recebe o sinal, ela continua mesmo após o turn/request ser
 * cancelado — vazando recursos e produzindo side-effects tardios.
 *
 * Padrões que este gate detecta:
 *
 *   1. `execa(...)` sem `cancelSignal` ou `signal` na mesma função/bloco
 *      que recebe um `signal: AbortSignal` como parâmetro.
 *
 *   2. `globalThis.fetch(url, opts)` onde `opts` não contém `signal`
 *      mas a função circundante tem um AbortSignal no escopo.
 *
 * Falsos positivos esperados: funções onde o AbortSignal é gerenciado
 * via DisposableBase/dispose (padrão aprovado no projeto) — esses são
 * legítimos e devem ser anotados com `// abort: via dispose`.
 *
 * Este gate mantém um cap; novos usos devem ser auditados e documentados.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAX_VIOLATIONS = 0;

const SCAN_GLOBS = ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'];

const IGNORE_FRAGMENTS = ['/__tests__/', '/dist/', 'node_modules', '/locales/'];

// execa called without signal-related option key visible on same or adjacent line
const EXECA_NO_SIGNAL = /\bexeca\s*\([^)]*\)\s*(?!.*(?:signal|cancelSignal|timeout))/;

// globalThis.fetch or plain fetch with no signal in opts
// This is a heuristic — looks for fetch(url, { ... }) where opts has no `signal`
const FETCH_NO_SIGNAL = /\b(?:globalThis\.)?fetch\s*\(\s*[^,)]+,\s*\{(?![^}]*signal)[^}]*\}\s*\)/;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
  readonly snippet: string;
}

const files = new Set<string>();
for (const pattern of SCAN_GLOBS) {
  for (const f of globSync(pattern, { ignore: ['**/node_modules/**', '**/dist/**'] })) {
    files.add(f);
  }
}

const findings: Finding[] = [];
for (const file of files) {
  if (IGNORE_FRAGMENTS.some((frag) => file.includes(frag))) continue;

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    if (/^\s*\/\//.test(raw)) continue; // skip comments
    if (raw.includes('// abort:')) continue; // acknowledged exception

    if (EXECA_NO_SIGNAL.test(raw) && !raw.includes('signal') && !raw.includes('timeout')) {
      findings.push({
        file,
        line: i + 1,
        kind: 'execa-no-signal',
        snippet: raw.trim().slice(0, 140),
      });
    }
    if (FETCH_NO_SIGNAL.test(raw)) {
      findings.push({
        file,
        line: i + 1,
        kind: 'fetch-no-signal',
        snippet: raw.trim().slice(0, 140),
      });
    }
  }
}

if (findings.length > MAX_VIOLATIONS) {
  console.error(`\n${findings.length} potential AbortSignal propagation gaps:\n`);
  for (const f of findings) {
    console.error(`  [${f.kind}] ${f.file}:${f.line}`);
    console.error(`    ${f.snippet}`);
  }
  console.error(`
Para cada ocorrência:
  - Se o abort é gerenciado via DisposableBase/dispose, adicione um comentário:
    // abort: via dispose
  - Se o sinal deve ser propagado, passe \`signal\` ou \`cancelSignal\` na chamada.
  - Depois incremente MAX_VIOLATIONS neste script se necessário.
`);
  process.exit(1);
}

console.log(
  `[OK] ${findings.length} potential AbortSignal gaps (cap: ${MAX_VIOLATIONS}). Gate pass.`,
);
