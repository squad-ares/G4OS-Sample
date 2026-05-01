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

TASK-14-01 Slice 4 part 1 — `MigrationService` wired no main + tRPC `migration.detect`/`migration.plan`.

- `MigrationService` interface no `@g4os/ipc` (`migration-types.ts` extraído pra evitar inflar `context.ts` acima do gate de 500 LOC) — types `V1InstallView`, `MigrationPlanView`, `MigrationStepView`, `MigrationStepKindView`, `V1FlavorView`. IpcContext ganha `migration: MigrationService` always-on.
- `migration-router.ts` com 2 procedures `authed`: `detect` (query, output `V1InstallView | null`) e `plan` (query, input `{source?, target?}`, output `MigrationPlanSchema`). Schemas Zod com `.readonly()` em arrays pra match os types do package (que usam `readonly`).
- `MigrationServiceImpl` em `apps/desktop/src/main/services/migration-service.ts` (~75 LOC) — adapta `@g4os/migration` (detect + plan funções puras) ao contrato IPC. Stateless: caller (UI Wizard futuro) passa `V1Install` de volta pra `plan()`. Logger no boot e on-error pra debug futuro.
- Composition root: `MigrationServiceImpl` instanciado e injetado via `IpcServiceOverrides.migration` em `main/index.ts`. `ipc-context.ts` propaga overrides com fallback pra null-services.
- `null-services.ts` ganha stub `{ detect: ok(null), plan: err(notImplemented) }` — testes que não exercitam migration usam o stub default.
- `create-test-caller.ts` mock equivalente pra testes do router.
- 3 testes novos no `@g4os/ipc` cobrindo delegação detect/plan + assinatura correta.
- Main-size budget bumped 8900 → 9000 (75 LOC pelo migration-service real + ~10 pelo wire). Slice 4 part 2 (writers + execute) virá com bump separado.
- Apps/desktop ganhou `@g4os/migration` em deps (workspace).

Procurar render-side: o wizard UI (renderer) consumirá `trpc.migration.detect.query()` + `.plan.query()` na próxima slice; `execute()` ainda não existe no contrato — será adicionado quando os writers (workspaces/sessions/sources) estiverem prontos.
