---
'@g4os/data': minor
---

Adoção do Drizzle ORM (beta 1.0 pinado) sobre `node:sqlite` — TASK-04-02.

- `drizzle-orm@1.0.0-beta.17-8a36f93` e `drizzle-kit` matching; exceção controlada à política "sem beta em deps" documentada em [ADR-0042](../docs/adrs/0042-drizzle-orm-beta-pinned.md).
- Schemas tipados: `workspaces`, `sessions`, `messages_index`, `event_checkpoints`, `sessions_fts` (FTS5 virtual + triggers via SQL raw).
- Factory `createDrizzle(db)` + `drizzle.config.ts`.
- Baseline migration gerada em `packages/data/drizzle/20260418201846_baseline/`.
- 9 testes de CRUD, FK cascade, unique, composite PK, índices e FTS5 insert/delete triggers.
- TODO rastreável para migrar ao GA em [`docs/TODO-DRIZZLE-GA.md`](../docs/TODO-DRIZZLE-GA.md).
