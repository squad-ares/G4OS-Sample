#!/usr/bin/env tsx
/**
 * Gate 10c-52 — Promise.race sem rollback.
 *
 * `Promise.race` é seguro quando o lado perdedor não adquire recursos
 * (lock, connection, credencial) que nunca serão liberados se o vencedor
 * resolver primeiro. Padrões problemáticos:
 *
 *   - Race entre `mutex.acquire()` e timeout: se timeout vencer,
 *     `acquire()` ainda está em vôo e pode completar depois, vazando o lock.
 *   - Race entre `writeCredential()` e timeout: write pode persistir após
 *     o caller já ter tratado o timeout como falha.
 *
 * Padrões seguros:
 *   - Race com `AbortPromise` + cleanup explícito na catch
 *   - Race entre `fetch` + timeout onde fetch cancela via AbortSignal
 *   - Race com `Promise.resolve` (uma das partes é síncrona)
 *   - Race com `Promise.allSettled` (never rejects, timeout é deadline)
 *
 * Este gate mantém um inventário de todos os `Promise.race` no codebase.
 * Novo uso → incrementar MAX_ALLOWED e adicionar anotação de segurança
 * no PR (comentário explicando o padrão e o cleanup).
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAX_ALLOWED = 4;

const SCAN_GLOBS = ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'];

interface Usage {
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

const usages: Usage[] = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    if (/\bPromise\.race\b/.test(raw) && !/^\s*\/\//.test(raw)) {
      usages.push({ file, line: i + 1, snippet: raw.trim().slice(0, 160) });
    }
  }
}

if (usages.length > MAX_ALLOWED) {
  console.error(`\nPromise.race usages exceeded cap: ${usages.length} (max ${MAX_ALLOWED})\n`);
  console.error('Todos os usos de Promise.race:\n');
  for (const u of usages) {
    console.error(`  ${u.file}:${u.line}`);
    console.error(`    ${u.snippet}`);
  }
  console.error(`
Novo Promise.race requer:
  1. Incrementar MAX_ALLOWED neste script.
  2. Adicionar comentário no PR explicando:
     - Por que o side "perdedor" não pode vazar recursos
     - Qual cleanup é feito (cancel, unref, removeEventListener, etc.)
`);
  process.exit(1);
}

console.log(`[OK] ${usages.length}/${MAX_ALLOWED} Promise.race usages (dentro do inventário):`);
for (const u of usages) {
  console.log(`  ${u.file}:${u.line}`);
}
