#!/usr/bin/env tsx
// ADR-0013: process.platform/os.platform()/os.homedir() só podem ser lidos
// dentro de @g4os/platform. Gate de CI que falha se outros pacotes leem
// diretamente — força fluxo via getPlatformInfo()/isMacOS()/isWindows()/isLinux().

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const ALLOWED_PREFIXES: readonly string[] = [
  // Único lugar autorizado a ler process.platform/os.platform/os.homedir
  'packages/platform/src/',
  // Scripts de build/CI rodam fora do runtime do produto
  'scripts/',
];

const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; description: string }> = [
  { pattern: /\bprocess\.platform\b/, description: 'process.platform' },
  { pattern: /\bos\.platform\(\)/, description: 'os.platform()' },
  { pattern: /\bos\.homedir\(\)/, description: 'os.homedir()' },
  { pattern: /\bos\.tmpdir\(\)/, description: 'os.tmpdir()' },
];

// CR-18 F-P2: o regex de member-access (`os.homedir()`) perdia named imports
// (`import { homedir } from 'node:os'`). Scan separado pega o import statement
// e detecta os símbolos sensíveis nos braces. Lista cobre symbols que ADR-0013
// considera "platform identity" — o que muda por user/OS e deve passar pelo
// `@g4os/platform`. Hardware counts (`cpus`, `networkInterfaces`, `totalmem`,
// `freemem`) ficam de fora propositalmente — não são "platform leaks", são
// recursos do host.
const FORBIDDEN_IMPORT_SYMBOLS = new Set([
  'homedir',
  'tmpdir',
  'platform',
  'arch',
  'hostname',
  'userInfo',
]);
const IMPORT_FROM_OS = /^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](?:node:)?os['"]/;

const files = globSync('{packages,apps}/**/src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
});

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly snippet: string;
}

const violations: Violation[] = [];

for (const file of files) {
  if (ALLOWED_PREFIXES.some((p) => file.startsWith(p))) continue;
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    let scan = raw;
    // Tracking de bloco /* ... */ multi-linha
    if (inBlockComment) {
      const endIdx = scan.indexOf('*/');
      if (endIdx === -1) continue;
      scan = scan.slice(endIdx + 2);
      inBlockComment = false;
    }
    // Strip comments inline /* ... */ na mesma linha
    scan = scan.replace(/\/\*[\s\S]*?\*\//g, '');
    const openIdx = scan.indexOf('/*');
    if (openIdx !== -1) {
      inBlockComment = true;
      scan = scan.slice(0, openIdx);
    }
    // Strip comments de linha
    scan = scan.replace(/\/\/.*$/, '');
    // Strip strings em backtick/aspas para não pegar identificador citado em código gerador
    scan = scan
      .replace(/`[^`]*`/g, '``')
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""');
    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      if (pattern.test(scan)) {
        violations.push({
          file,
          line: i + 1,
          pattern: description,
          snippet: raw.trim().slice(0, 120),
        });
      }
    }
    // Detecta named imports de `node:os` / `os` com símbolos sensíveis.
    const importMatch = IMPORT_FROM_OS.exec(raw);
    if (importMatch) {
      const namedList = (importMatch[1] ?? '').split(',');
      for (const named of namedList) {
        // Suporta `homedir` e `homedir as foo`.
        const symbol = named
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (symbol && FORBIDDEN_IMPORT_SYMBOLS.has(symbol)) {
          violations.push({
            file,
            line: i + 1,
            pattern: `import { ${symbol} } from 'node:os'`,
            snippet: raw.trim().slice(0, 120),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n- ${violations.length} platform-leak violations:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.snippet}`);
  }
  console.error(
    `\nUse @g4os/platform (getPlatformInfo / isMacOS / isWindows / isLinux). Adapte a injeção via factory se necessário.\n`,
  );
  process.exit(1);
}

console.log(`[OK] All ${files.length} files use @g4os/platform for OS detection`);
