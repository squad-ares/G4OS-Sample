# Deferred: Drizzle snapshot reconstruction (10c-09 follow-up)

**Status:** ⏸️ Tech debt aceito — gate forward-only protege contra novas regressões.

## Origem

7 migrations em `packages/data/drizzle/` foram criadas sem rodar
`drizzle-kit generate` (provavelmente mãos manuais editando `migration.sql`).
Resultado: cada uma dessas migrations não tem `snapshot.json` adjacente.

Migrations afetadas:
- `20260422000000_sessions_labels_branching`
- `20260422020000_projects`
- `20260423140000_sessions_provider_model`
- `20260423170000_sessions_working_directory`
- `20260424000000_sessions_source_slugs`
- `20260427000000_attachment_refs_cascade`
- `20260427120000_projects_slug_unique`

## Impacto

1. **`drizzle-kit generate` perde histórico incremental.** Sem snapshots,
   o gerador compara TS schema vs BASELINE (apenas a primeira migration
   tem snapshot completo). Resultado: tenta criar uma migration "nova"
   que recria todas as tabelas/colunas que já existem — destrutiva em DBs
   reais.
2. **Drift TS schema vs DB não detectável** automaticamente. Mudança no
   TS schema sem migration correspondente passa silenciosa.

## Mitigação atual

Gate `pnpm check:drizzle-snapshots` (em `scripts/check-drizzle-snapshots.ts`)
é **forward-only**: aceita as 7 migrations legadas via lista hardcoded;
falha se NOVA migration entrar sem snapshot. Plus side: protege a partir
daqui sem precisar reconstruir o passado.

## Reconstrução real (quando vale o esforço)

Se a equipe quiser detectar drift schema-vs-DB (10c-09 Phase 2):

1. **Backup do DB de produção** (vital — passo 2 mexe em estado).
2. **Reconstrução dos snapshots manualmente:**
   - Para cada migration sem snapshot, gerar o snapshot que reflete o
     schema EXATAMENTE como ele existia naquele ponto histórico.
   - Drizzle não tem comando pra "back-fill snapshot a partir do
     migration.sql". Significa carry-forward manual: começar do
     `20260418201846_baseline/snapshot.json`, aplicar cada migration
     SQL na cabeça, gerar snapshot, salvar.
3. **Validar com dry-run:**
   - Após reconstrução completa, rodar `drizzle-kit generate` em ambiente
     limpo (sem DB) — não deve produzir migration nova.
   - Se produzir, snapshot estava errado em algum ponto; iterar.
4. **Commit batch único** com os 7 snapshots + remover `LEGACY_NO_SNAPSHOT`
   do gate.

Esforço estimado: 1 dev/dia (dependendo da complexidade dos schemas
intermediários — vários ALTER TABLE, índices, FKs).

## Quando vale fazer

- Antes de qualquer mudança grande de schema (refactor de tabelas,
  adição de FK em escala) — pra ter confiança que `drizzle-kit generate`
  vai produzir o diff certo.
- Antes do GA — se decidirmos que detecção de drift é gate de release.

Hoje (MVP/canary), forward-only é suficiente. Bug de schema é capturado
por testes de integração `@g4os/data` rodando contra SQLite real.

## Referências

- TASK-10c-09 em `STUDY/Audit/Tasks/10c-hardening/README.md`
- `scripts/check-drizzle-snapshots.ts` — gate forward-only
- ADR-0042 — Drizzle pinado em beta
