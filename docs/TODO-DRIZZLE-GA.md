# TODO: Migrar para Drizzle 1.0 GA

Rastreador de débito técnico criado junto com ADR-0042.

## Contexto resumido

A v2 está usando `drizzle-orm@1.0.0-beta.17-8a36f93` + `drizzle-kit@1.0.0-beta.17-8a36f93` porque o driver `node-sqlite` (ADR-0040a) **só existe na beta 1.0**. Drizzle `@latest` (0.45.2 em 2026-04-18) não tem esse subpath.

Decisão formal: [ADR-0042](./adrs/0042-drizzle-orm-beta-pinned.md). Única exceção autorizada à política "sem beta em `dependencies`".

## Gatilho

- ✅ **Primário:** Drizzle 1.0 GA lançar como `@latest` no npm.
- ⚠️ **Secundário:** CVE crítico na beta atual.
- 📅 **Prazo de revisão automática:** 2026-10-18 (6 meses após aceite).

## Checklist de migração

Rodar quando drizzle-orm 1.0 GA:

- [ ] Checar `npm view drizzle-orm@latest version` retorna `1.0.x` sem sufixo beta.
- [ ] Checar `drizzle-orm` exports tem `./node-sqlite` na release GA (não só na tag beta).
- [ ] Ler changelog oficial do GA para breaking changes vs beta.17.
- [ ] `pnpm update drizzle-orm drizzle-kit --filter @g4os/data` (com `save-exact=true` já ativo).
- [ ] Rodar `pnpm --filter @g4os/data test` — todos os 9 testes drizzle devem passar.
- [ ] Rodar `pnpm exec drizzle-kit generate --name ga-migration-check` no packages/data.
  - Se diff contra baseline é vazio, migração é limpa.
  - Se houver diff, avaliar impacto (schema precisa alterar, ou é só formatação).
- [ ] Remover `mssql` / `@types/mssql` de `pnpm.peerDependencyRules.ignoreMissing` em `package.json` se GA não puxar esses peers.
- [ ] Rodar todos os gates (`typecheck`, `lint`, `test`, `build`, `check:*`).
- [ ] Atualizar ADR-0042 status → `Superseded by ADR-XXXX` (novo ADR "Drizzle 1.0 GA adotado").
- [ ] Atualizar `CLAUDE.md` + `AGENTS.md` removendo menção ao caveat.
- [ ] Deletar este arquivo.

## Monitoramento enquanto beta

- Toda PR que toca `packages/data` ou bumpa `drizzle-orm` deve ler o changelog do drizzle entre a versão atual e a pretendida.
- Ao fazer `pnpm update`, verificar que só drizzle-orm+drizzle-kit mudam. Pin exato deve impedir upgrades acidentais, mas CI do changeset pode pegar desvio.

## Alternativas pré-planejadas caso GA atrasar ou introduzir breaking change

Se 2026-10-18 passar sem GA ou GA introduzir breaking change que bloqueia upgrade:

1. **Extender beta.** Novo ADR justificando extensão; reavaliar novamente em +3 meses.
2. **Migrar para Opção B (shim)** documentada em ADR-0042 "Opções consideradas". Custo: ~1-2 dias de implementação + testes de edge cases do SQLite.
3. **Migrar para Opção C (SQL raw + Zod)** documentada em ADR-0042. Custo: reescrever acesso a dados; ~3-4 dias.

A Opção D (reverter node:sqlite → better-sqlite3) fica vetada — contradiz ADR-0040a que resolve dor reportada do cliente.
