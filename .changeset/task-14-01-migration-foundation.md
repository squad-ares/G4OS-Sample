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

TASK-15-01 + TASK-14-01 Slice 1 — Beta-to-GA fundação.

- **TASK-15-01**: `docs/ga-gates.md` formaliza acceptance criteria para release GA com 7 gates (F/Q/P/S/Sec/C/D), dashboard executivo, processo Go/No-Go semanal e sign-off. Snapshot inicial: F=5/10, Q=🟡, P=⬜, S=⬜, Sec=🟡, C=🟡, D=🟡 → veredicto **No-Go**. Bloqueadores principais: features 04-12 (Onda 3), benchmarks (TASK-15-02), pentest (TASK-15-03), migration tooling (Epic 14).
- **TASK-14-01 Slice 1**: novo pacote `@g4os/migration` com fundação V1 → V2. `detectV1Install(home?)` (real, candidatos `~/.g4os` + `~/.g4os-public`), `createMigrationPlan({source, target})` (real, conta workspaces/sessions/credentials/etc., emite warnings, respeita `.migration-done` marker), `execute(plan, options)` (real, backup atômico + rollback em falha + idempotência via marker), `migrate-config` step (real). Steps `credentials/workspaces/sessions/sources/skills` ficam stubs explícitos com `Result.err` documentando o que precisa pra slice 2/3. CLI entry `pnpm migrate:v1` com `--dry-run`/`--force`/`--source`/`--target`/`--steps`. 21 testes passando (detector + plan + executor com tmpdir sandbox).
- **commitlint**: scope `migration` adicionado ao enum.
