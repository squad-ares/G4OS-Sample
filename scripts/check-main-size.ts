#!/usr/bin/env tsx
/**
 * Gate: total de LOC em `apps/desktop/src/main/` < MAIN_LIMIT, com cada
 * arquivo ≤ FILE_LIMIT. Falha o build se estourar.
 *
 * O orçamento cresceu de 2000 para 3000 em 2026-04-21 junto com o
 * Epic 10b-wiring: main passou a compor de verdade observability,
 * credentials, auth e futuras integrações de data/agents/sources.
 *
 * O orçamento cresceu de 3000 para 4500 em 2026-04-22 junto com o
 * Epic 11-features/02-workspaces: workspace-transfer-service,
 * workspaces-service, platform-service, windows-service e helpers de
 * filesystem/transfer (todos arquivos <300 LOC) são o custo legítimo
 * de adicionar o domínio de workspaces ao composition root do main.
 *
 * O orçamento cresceu de 4500 para 4800 em 2026-04-22 junto com o
 * Epic 11-features/03-projects TASK-11-03-06 (legacy import): addition of
 * legacy-import.ts (~112 LOC) e métodos discoverLegacyProjects/importLegacyProjects
 * em projects-service.ts (~57 LOC adicionais) completam o domínio de projects.
 *
 * O orçamento cresceu de 4800 para 6200 em 2026-04-23 junto com TASK-OUTLIER-07/08/09:
 * multi-provider agents-bootstrap, credentials-service (vault + IPC + env migration),
 * e fundação da integração de tool use + permission broker (sessions/turn-events.ts,
 * sessions/turn-finalize.ts, sessions/provider-slug.ts, sessions/mutations.ts,
 * plus permission-broker/store/bridge e extensões de turn-dispatcher no seguimento
 * da OUTLIER-09). CLAUDE.md e AGENTS.md devem refletir esse novo teto.
 *
 * Em 2026-04-23 (TASK-OUTLIER-11) o gate passou a ignorar `src/main/workers/**`:
 * código sob `workers/` roda em processos isolados (`utilityProcess` para
 * `session-worker.ts`/`turn-runner.ts`/`protocol.ts`, Piscina thread para
 * `cpu-pool/tasks.ts`). Esses bundles são medidos separadamente via output
 * size do rollup e não contam no orçamento do main runtime.
 *
 * Em 2026-04-24 o main foi puxado pra baixo de 7987 → ~5976 LOC via extrações
 * arquiteturais (sem elevar o teto): `@g4os/session-runtime` (tool-loop +
 * turn-runner + event-bus + helpers), `@g4os/permissions` (broker + store),
 * `@g4os/sources/{planner,catalog,store}`, `@g4os/agents/tools/handlers/activate-sources`,
 * e `connectionSlugForProvider` movido para `@g4os/kernel/types`. MAIN_LIMIT
 * permanece em 6200 — próxima elevação exige nova extração ou ADR.
 *
 * Em 2026-04-24 (FOLLOWUP-04/08) o teto subiu de 6200 → 6500 com duas novas
 * extrações: `sessions/lifecycle.ts` (delete/archive/restore + applyReducer
 * adapter) e `sessions/retry-truncate.ts` (retryLastTurn + truncateAfter +
 * planner), ambos mantendo `sessions-service.ts` ≤ 300 LOC. Cresceu
 * `@g4os/data/events` (`truncateProjection` — projeção SQLite tras truncate
 * do JSONL) e a assinatura de `MessagesService.append` agora carrega a
 * `sequenceNumber` real em vez do placeholder `0` nos 5 callers.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const MAIN_LIMIT = 6500;
const FILE_LIMIT = 300;

const files = globSync('apps/desktop/src/main/**/*.ts', {
  ignore: ['**/__tests__/**', '**/*.test.ts', '**/workers/**'],
});

let total = 0;
const oversized: Array<{ file: string; lines: number }> = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  total += lines;
  if (lines > FILE_LIMIT) oversized.push({ file, lines });
}

let failed = false;

if (oversized.length > 0) {
  console.error(`\n- ${oversized.length} main files exceed ${FILE_LIMIT} lines:\n`);
  for (const { file, lines } of oversized) console.error(`  ${file}: ${lines}`);
  failed = true;
}

if (total > MAIN_LIMIT) {
  console.error(`\nmain process total LOC: ${total} > ${MAIN_LIMIT}`);
  failed = true;
}

if (failed) process.exit(1);

console.log(`[OK] main process LOC: ${total} / ${MAIN_LIMIT} (files: ${files.length})`);
