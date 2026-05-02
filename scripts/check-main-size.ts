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
//
// 2026-04-30 (code-review batch): teto sobe de 7250 → 8800 por conta de:
// - debug-hud/ (~634 LOC): aggregator, window, index — HUD interno de
//   diagnóstico; wiring legítimo no composition root.
// - preferences-store.ts + preferences-service.ts (~266 LOC): settings
//   persistidos por workspace; extraídos de workspaces-service.
// - update-service.ts (~111 LOC): Electron autoUpdater wired no boot.
// - startup-preflight-helpers.ts (~100 LOC): extração de helpers do
//   preflight para manter startup-preflight-service.ts ≤ 300 LOC.
// - turn-dispatcher-types.ts (~75 LOC) + turn-dispatcher-guards.ts (~55 LOC):
//   extrações para manter turn-dispatcher.ts ≤ 300 LOC.
// Crescimento líquido: +1550 LOC de features e extrações legitimamente em main.
//
// 2026-04-30 (UX/observability fixes): teto sobe de 8800 → 8900 por conta de:
// - metrics-scrape-server.ts (~24 LOC): expõe /metrics Prometheus para scrape local.
// - observability bootstrap em index.ts: .env loading antes de app.whenReady()
//   (Sentry exige init pré-ready) + wire do scrape server.
// - window-manager.ts: bloqueio de Cmd+R/F5 em production builds (reload destrói
//   estado in-flight: streams, drafts, modais pendentes).
// - electron-runtime.ts: tipos para WebContents.on('before-input-event') usado
//   pelo bloqueio acima.
// - debug-hud/window.ts: `frame: true` + `alwaysOnTop: false` (UX bug — HUD
//   roubava foco da janela principal e não tinha botão de close).
// - turn-dispatcher.ts: emite `turn.done` após runToolLoop pra renderer limpar
//   `streamingTurnId` de forma confiável (antes era leak; ghost message ficava
//   pendurado em algumas paths de erro).
//
// 2026-04-30 (TASK-14-01 Slice 4 part 1): teto sobe de 8900 → 9000 com
// `migration-service.ts` (~75 LOC) — facade que adapta `@g4os/migration`
// (detect + plan) ao contrato `MigrationService` do IPC. Composition root
// instancia + plumbing através de `IpcServiceOverrides`. `execute()` virá
// em slice 4 part 2 com writers (workspaces/sessions/sources).
//
// 2026-04-30 (TASK-14-01 Slice 4 part 2): teto sobe de 9000 → 9300 com
// `migration/writers.ts` (~190 LOC) — V2WorkspaceWriter (drizzle direct +
// bootstrap fs), V2SourceWriter (SourcesStore.insert), V2SessionWriter
// (SessionsRepository + SessionEventStore + applyEvent). Composição
// limpa: writers ficam em arquivo próprio dentro de `services/migration/`,
// migration-service.ts cresce ~80 LOC com `execute()` que orquestra.
//
// 2026-04-30 (Epic 18 + 10b sub-tasks): teto sobe de 9300 → 9400 com
// `global-shortcuts.ts` (~85 LOC) — registro Cmd+Shift+N + Cmd+Shift+W
// no main process, IPC channel pra renderer focar composer.
//
// 2026-04-30 (Epic 18 — tray + deep-link extension): teto sobe de 9400 →
// 9600 com `tray-service.ts` (~148 LOC) + expansão de
// `deep-link-handler.ts` (~40 LOC adicionais: PATH_WHITELIST estendido +
// IPC forward `deep-link:navigate` pra janela existente em vez de só
// abrir nova).
//
// 2026-05-01 (10c-32 + window-bounds extraction): teto sobe de 9600 →
// 9700 com `window-bounds.ts` (~67 LOC, extraído de window-manager pra
// reduzir o file-size do composition root e separar I/O atômico de
// lifecycle) + `onWindowCreated` subscriber pattern em window-manager
// pra IPC server cobrir janelas criadas após o boot (multi-window via
// WindowsService, deep-link, debug-hud).
//
// 2026-05-01 (CR-15 Wave 1+2): teto sobe de 9700 → 9800 com:
// - `services/attachments-gc-bootstrap.ts` (~37 LOC) wired no boot pra
//   GC de blobs órfãos (sem isso, attachments folder crescia monotonic).
// - `turn-dispatcher` ganhou try/catch em buildMountedHandlers (~12 LOC).
// - `backup-bootstrap` retorna {scheduler, gateway} (~10 LOC).
// - `shutdown-bootstrap` await drain antes de dispose (~5 LOC).
// - `debug-hud/{index,window}.ts` ganharam onWebContentsCreated hook
//   (~16 LOC) pra IPC bootstrap wirar cleanup de subscriptions no HUD.
//
// 2026-05-01 (CR-17 — Backup IPC + UI completion): teto sobe de 9800 →
// 10000 com:
// - `services/backup-service.ts` (~135 LOC NEW) — implementa `BackupService`
//   IPC (list/runNow/delete) compondo `BackupScheduler` + filesystem queries
//   com path-guard no delete (refused se path fora de auto-backups dir).
// - `services/backup-scheduler.ts` (+~25 LOC) — método público novo
//   `runForWorkspace(id)` pra backup manual fora do ciclo periódico, +
//   getter `backupDir` pra UI revelar via showItemInFolder.
// - `ipc-context.ts` (+~5 LOC) — wire de `backup` service no override map
//   + null fallback.
// - `index.ts` (+~3 LOC) — import + injeção de `createBackupService` no
//   `initIpcServer({ services })`.
// Settings hub pré-canary completou as 14 categorias (12 ready + 2 planned)
// com Backup como categoria de UI funcional — antes o BackupScheduler
// rodava 24h em background mas usuário não tinha visibilidade nem trigger
// manual. Pequena dívida de domínio paga.
//
// 10000 → 10150 — CR-18 F-DT-I: novo `services/single-instance-bootstrap.ts`
// (~107 LOC) registra `requestSingleInstanceLock` + `setAsDefaultProtocolClient`
// + `second-instance` listener + argv deep-link consumer. Sem isso o OS
// jamais entrega URLs `g4os://...` ao app: era um buraco crítico não
// mapeado em CRs anteriores (deep-link handler existia mas runtime ignorava
// porque o protocol nunca era registrado). +`electron-runtime.ts` (+~20 LOC)
// expõe `requestSingleInstanceLock`/`setAsDefaultProtocolClient` no contrato
// `ElectronApp` e adiciona overload `on('second-instance', ...)` para
// type-safety. +`index.ts` (+~25 LOC) wire 4 funções da bootstrap no
// composition root antes de `whenReady()`. Próxima elevação exige nova
// extração estrutural OU ADR justificando.
//
// 10150 → 10300 — code-review-19 retrofit: o commit `bd20855
// feat(desktop): Services status screen with real HTTP connectivity probing`
// adicionou `services/services-prober.ts` (111 LOC) — probe HTTP HEAD com
// timeout pros endpoints de observability (Sentry DSN, OTLP, metrics
// scrape) que reporta `reachable/latencyMs/error` real ao usuário em
// `Settings → Services`, distinguindo "configurado mas inacessível" de
// "ativo". Sem isso operadores ficavam cegos a configs aceitas mas que
// não chegavam ao backend. PR original esqueceu de bumpar o teto; gate
// passou a falhar cumulativamente quando outros pacotes cresceram em
// ~10 LOC. Total atual: 10246 LOC. Buffer de 54 LOC para ajustes menores
// até próxima extração estrutural (candidato natural: mover `services-prober.ts`
// para `@g4os/observability/probe` em refactor futuro — função é
// observability-agnostic e não tem deps de Electron).
const MAIN_LIMIT = 10300;
const FILE_LIMIT = 300;

// Composition roots e agregadores de diagnóstico com teto próprio.
// Cada entrada justifica por que o FILE_LIMIT padrão não se aplica.
const FILE_EXEMPTIONS: Map<string, number> = new Map([
  // TurnDispatcher: orquestra agent run + tool loop + permission broker
  // + mount registry + telemetry + event bus. CR-15 wave 1 adicionou
  // try/catch em buildMountedHandlers (~12 LOC pra fail-soft). Extrair
  // em helper sibling foi avaliado mas o try local mantém escopo do
  // logger e do sessionId — extração viraria 2 indireções pra mesmo log.
  // Teto 320.
  ['apps/desktop/src/main/services/turn-dispatcher.ts', 320],

  // SourcesService: 9 procedures IPC (list/listAvailable/get/enableManaged/
  // createStdio/createHttp/setEnabled/delete/testConnection) + secrets
  // wire + status probing. CR-16 F-22 adicionou cleanup explícito de
  // timer no testConnection (~5 LOC). Cada procedure tem boilerplate
  // mínimo e error mapping próprio — extrair em sub-services ainda
  // exigiria pass-through props sem ganho de legibilidade. Teto 320.
  ['apps/desktop/src/main/services/sources-service.ts', 320],

  // Composition root do processo principal: instancia todos os serviços,
  // registra shutdown handlers, bootstrapa IPC e janela. Concentração
  // intencional — extrair implicaria prop drilling ou Context API sem
  // ganho real de legibilidade. CR-18 F-DT-I bumpou para acomodar wiring
  // do single-instance lock + protocol client + second-instance handler
  // (~10 LOC inline antes do whenReady, ~5 LOC adjacente ao deep-link).
  // Teto: 500 LOC.
  ['apps/desktop/src/main/index.ts', 500],
]);

const files = globSync('apps/desktop/src/main/**/*.ts', {
  ignore: ['**/__tests__/**', '**/*.test.ts', '**/workers/**'],
});

let total = 0;
const oversized: Array<{ file: string; lines: number }> = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  total += lines;
  const limit = FILE_EXEMPTIONS.get(file) ?? FILE_LIMIT;
  if (lines > limit) oversized.push({ file, lines });
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
