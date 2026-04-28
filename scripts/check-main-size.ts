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
 * Em 2026-04-24 (MVP cleanup) worker-per-session foi removido como decisão
 * arquitetural (ADR-0145 supersedes 0030): as 4 causas raiz da dor de memória
 * V1 já estão cobertas por main thin + @parcel/watcher + DisposableBase +
 * MemoryMonitor. Diretório `workers/` foi inteiramente deletado; se
 * reintroduzido no futuro (ex. Piscina CPU-bound), adicionar o glob de
 * workers de volta ao ignore abaixo.
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
 *
 * Em 2026-04-24 (MVP Step 1 — OUTLIER-12 slice 5: mount wiring) o teto subiu
 * de 6500 → 6700 por conta do wire estrutural do `McpMountRegistry` no
 * `TurnDispatcher`: novo helper `sessions/mount-plan.ts` (SourceConfigView →
 * SourceConfig adapter + ensureMounted + buildMountedToolHandlers), imports
 * e dep extra em `TurnDispatcher`, e uso de `composeCatalogs` para sobrepor
 * handlers dinâmicos aos built-ins. O broker real (`@g4os/sources/broker`)
 * vive fora do main; o que conta aqui é só o adapter.
 *
 * Em 2026-04-24 (MVP Step 5 — OUTLIER-23 Phase 2) o teto subiu de 6700 →
 * 6800 por conta da infra E2E: `agents/stub-agent-factory.ts` (stub `IAgent`
 * emitindo text_delta fake quando `G4OS_E2E=1`) + branch `buildMockAuthRuntime`
 * em `auth-runtime.ts` (pré-auth com token seed). Ambos são composition-root
 * concerns — não faz sentido mover pra packages porque são conditional wiring
 * do desktop main, não contratos reutilizáveis.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

// 2026-04-26 (code-review-3): teto sobe de 6800 → 6900 por conta de:
// - CR3-06 slug conflict pre-check em workspaces-service (~13 LOC).
// - CR3-13 transfer-manifest e legacy-import retornando Result em vez
//   de throw (~40 LOC adicionais entre err/ok wrappers e callers).
// - CR3-01 + CR3-03 wiring de @g4os/platform em platform-service e
//   isMacOS no index (~10 LOC líquidos).
//
// 2026-04-27 (code-review-5): teto sobe de 6900 → 7100 por conta de:
// - CR5-01 wiring de BackupScheduler + cleanupOrphanTmp no boot
//   (~36 LOC líquidos no index.ts).
// - Extrações para manter index ≤ 300: services/backup-bootstrap.ts,
//   services/cleanup-orphan-tmp-bootstrap.ts, services/shutdown-bootstrap.ts
//   (~95 LOC adicionais, mas são helpers focados de 1 responsabilidade).
//
// 2026-04-27 (code-review-6): teto sobe de 7100 → 7200 por conta de:
// - CR6-06 AppLifecycle vira `DisposableBase` + remove de SIGINT/SIGTERM
//   e listeners de `app` (~25 LOC líquidos em app-lifecycle.ts).
// - CR6-08 `drainActiveTurns` extraído para sessions/turn-drain.ts
//   (~35 LOC) + wiring de `completion` no `ActiveTurn` em turn-dispatcher.
// - CR6-09 try/catch no `onMutation` callback do CredentialsService.
// - CR6-15 whitelist de scheme + path em deep-link-handler (~25 LOC).
// - CR6-19 mount-plan log spam reduzido (sem mudança de LOC líquida).
//
// 2026-04-27 (code-review-10): teto sobe de 7200 → 7250 por conta de:
// - sources/secrets.ts (189 LOC novos, módulo dedicado) — separa o vault
//   de segredos por bucket (env/headers) do `sources-service.ts`, com
//   `secureSourceConfigSecrets` / `hydrateSourceSecrets` /
//   `migrateStoredSourceSecrets` / `deleteSourceSecrets`.
// - sources-service.ts +69 LOC para wire de credentialRefs no create
//   stdio/http/delete/testConnection. Crescimento líquido em main: +23 LOC
//   após reaproveitamento dos helpers de secrets em vez de inline.
const MAIN_LIMIT = 7250;
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
