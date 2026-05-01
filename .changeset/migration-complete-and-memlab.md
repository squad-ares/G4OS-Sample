---
'@g4os/agents': patch
'@g4os/auth': patch
'@g4os/credentials': patch
'@g4os/data': patch
'@g4os/desktop': patch
'@g4os/desktop-e2e': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/migration': patch
'@g4os/observability': patch
'@g4os/permissions': patch
'@g4os/platform': patch
'@g4os/session-runtime': patch
'@g4os/sources': patch
'@g4os/translate': patch
'@g4os/ui': patch
'@g4os/viewer': patch
---

3 entregas em sequência: Migration end-to-end, Memlab calibração, UI Wizard.

**TASK-14-01 Slice 4 part 2 — Migration `execute()` real**:
- Contrato `MigrationService` ganha `execute()` com `MigrationExecuteInputView` + `MigrationReportView` em `@g4os/ipc`. tRPC procedure `migration.execute` (mutation) com Zod schemas + readonly arrays.
- 3 V2 writers reais em `apps/desktop/src/main/services/migration/writers.ts`:
  - `V2WorkspaceWriter`: drizzle direct (preserva V1 IDs) + `bootstrapWorkspaceFilesystem`. Metadata V1 (color/description/category) preservada sob `v1Imported` namespace pra recuperação futura.
  - `V2SourceWriter`: `SourcesStore.insert` com category derivada de slug heurístico (gmail→google, github→dev, etc.) e authKind oauth se há credentialKey.
  - `V2SessionWriter`: `SessionsRepository.create` (preserva V1 IDs, valida provider contra enum) + `SessionEventStore.append` + `applyEvent` (atualiza projeção SQLite).
- `MigrationServiceImpl.execute()` orquestra: detect → plan → backup → run all 6 steps → rollback em falha → marker. Logs estruturados via `createLogger`.
- Composition root: deps reais (`drizzle`, `sessionsRepo`, `sourcesStore`, `vault`) injetadas em `main/index.ts`.

**TASK-17-11 — Memlab baseline calibração**:
- `apps/desktop-e2e/tests/memory-cycle.e2e.ts` agora aceita `G4OS_MEMLAB_CYCLES`, `G4OS_MEMLAB_THRESHOLD_MB` e `G4OS_MEMLAB_BASELINE` via env.
- Modo `BASELINE_MODE=1` desativa assertions, imprime amostras heap por ciclo (~10 pontos) — facilita calibração antes de fixar threshold de produção.
- Scripts pnpm: `memlab:hud` (gate) e `memlab:hud:baseline` (calibração).
- README com seção dedicada explicando processo de calibração e variáveis env.

**TASK-14-01 Slice 4 part 3 — Renderer Migration Wizard**:
- Novo feature `@g4os/features/migration` com `MigrationWizard` component (5 estados: detecting / no-v1 / plan-review / executing / done / error). Decoupled via `MigrationPorts` interface (testável).
- Rota `/migration` em `apps/desktop/src/renderer/routes/migration.tsx` mounta o wizard wireado a `trpc.migration.{detect,plan,execute}`.
- 35 translation keys novas em pt-BR + en-US (parity validada pelo `check:i18n`).
- UI mostra: V1 path/version, plan steps com counts/bytes, warnings (se houver), prompt opcional pra v1MasterKey (quando há credentials), report final com backup path + warnings collapsible.

**Main-size budget bumped 9000 → 9300** (writers.ts + execute orchestration). LOC atual: 9214/9300.
