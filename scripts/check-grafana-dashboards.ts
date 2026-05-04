#!/usr/bin/env tsx
/**
 * Gate: dashboards Grafana versionados em
 * `infra/observability/grafana/dashboards/*.json` precisam:
 *   1. parsear como JSON válido
 *   2. ter `uid` único + não-vazio
 *   3. ter `title` + `schemaVersion`
 *   4. exibir variáveis `service` e `env` em `templating.list` (TASK-16-04)
 *      — pra que o usuário não fique preso num único service/env hardcoded.
 *
 * Dashboards são deployed via provisioning automático (ver
 * `infra/observability/grafana/provisioning/dashboards/default.yml`).
 * UID é o que linka entre dashboards e annotations — duplicado quebra o link.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

interface DashboardShape {
  uid?: unknown;
  title?: unknown;
  schemaVersion?: unknown;
  templating?: { list?: Array<{ name?: unknown }> };
}

const files = globSync('infra/observability/grafana/dashboards/*.json');

if (files.length === 0) {
  console.error('No dashboards found in infra/observability/grafana/dashboards/');
  process.exit(1);
}

let failed = false;
const seenUids = new Map<string, string>();

for (const file of files) {
  const raw = readFileSync(file, 'utf-8');
  let parsed: DashboardShape;
  try {
    parsed = JSON.parse(raw) as DashboardShape;
  } catch (cause) {
    console.error(`[FAIL] ${file}: invalid JSON — ${(cause as Error).message}`);
    failed = true;
    continue;
  }

  if (typeof parsed.uid !== 'string' || parsed.uid.length === 0) {
    console.error(`[FAIL] ${file}: missing or empty "uid"`);
    failed = true;
    continue;
  }

  const prior = seenUids.get(parsed.uid);
  if (prior) {
    console.error(`[FAIL] ${file}: duplicated uid "${parsed.uid}" (also in ${prior})`);
    failed = true;
    continue;
  }
  seenUids.set(parsed.uid, file);

  if (typeof parsed.title !== 'string' || parsed.title.length === 0) {
    console.error(`[FAIL] ${file}: missing or empty "title"`);
    failed = true;
  }

  if (typeof parsed.schemaVersion !== 'number') {
    console.error(`[FAIL] ${file}: missing or invalid "schemaVersion"`);
    failed = true;
  }

  // `g4os-overview` é o dashboard sem variables (todos os panels usam o
  // service hardcoded `g4os`). Os outros 4 (memory/mcp/vault/ipc) precisam
  // expor `$service` + `$env` pra ser portáveis cross-env.
  if (parsed.uid !== 'g4os-overview') {
    const list = parsed.templating?.list ?? [];
    const names = list.map((v) => v.name).filter((n): n is string => typeof n === 'string');
    if (!names.includes('service')) {
      console.error(`[FAIL] ${file}: missing templating variable "service"`);
      failed = true;
    }
    if (!names.includes('env')) {
      console.error(`[FAIL] ${file}: missing templating variable "env"`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);

console.log(`[OK] ${files.length} dashboards validated, ${seenUids.size} unique uids`);
