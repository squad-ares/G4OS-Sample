#!/usr/bin/env tsx
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_DIR = 'docs/adrs';
const title = process.argv.slice(2).join(' ');

if (!title) {
  // biome-ignore lint/suspicious/noConsole: build script output
  console.error('Usage: pnpm adr:new "Short title here"');
  process.exit(1);
}

const existing = readdirSync(ADR_DIR)
  .filter((f) => /^\d{4}/.test(f))
  .map((f) => Number.parseInt(f.slice(0, 4), 10));

const next = String(Math.max(0, ...existing) + 1).padStart(4, '0');
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const filename = `${next}-${slug}.md`;

const template = readFileSync(join(ADR_DIR, '_template.md'), 'utf-8')
  .replace(/ADR NNNN/g, `ADR ${next}`)
  .replace(/\[Titulo curto\]/g, title)
  .replace(/YYYY-MM-DD/g, new Date().toISOString().split('T')[0]);

writeFileSync(join(ADR_DIR, filename), template);
// biome-ignore lint/suspicious/noConsole: build script output
console.log(`Created: ${ADR_DIR}/${filename}`);
