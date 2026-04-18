# ADR 0042: Drizzle ORM 1.0 beta pinado até GA — desvio controlado da política "sem beta em deps"

## Metadata

- **Numero:** 0042
- **Status:** Accepted (with known caveat)
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-02)
- **Dependências:** ADR-0040a (node:sqlite)

## Contexto

ADR-0040a adotou `node:sqlite` (stdlib do Node 24 LTS) como driver. A premissa foi que Drizzle ORM tem adapter first-class via `drizzle-orm/node-sqlite` — confirmado na documentação oficial (https://orm.drizzle.team/docs/connect-node-sqlite).

Ao executar TASK-04-02 descobrimos que:

1. **Drizzle stable** (`drizzle-orm@0.45.2`, `@latest` no npm em 2026-04-18) **não expõe** o subpath `./node-sqlite`. Só `./better-sqlite3`, `./libsql`, `./bun-sqlite`, etc.
2. **Drizzle beta 1.0** (`drizzle-orm@1.0.0-beta.17-8a36f93`, tag `node-sqlite`) **expõe** o subpath e funciona integrado com `DatabaseSync`.
3. O time do Drizzle publica tags nomeadas (`node-sqlite`, `kit/node-sqlite`) que referenciam as versões beta estáveis o suficiente para uso — sinalizando cuidado explícito com esta linha de código.

A documentação oficial está **à frente do `@latest`** porque a API já foi publicada nas betas; o GA simplesmente ainda não saiu.

Isso criou tensão com nossa política (CLAUDE.md + rewrite.md + package-analisis.md):

> "Pacotes em alpha/RC **não entram em `dependencies`**."

A política existe por um motivo concreto: `@strands-agents/sdk@1.0.0-rc.2`, `@uiw/react-json-view@2.0.0-alpha.40` e outros arrastaram débito técnico em v1. Manter disciplina aqui é o ponto.

## Opções consideradas

### Opção A: Drizzle beta 1.0 pinado (adotada)
Instalar `drizzle-orm@1.0.0-beta.17-8a36f93` e `drizzle-kit@1.0.0-beta.17-8a36f93` com pin exato (`save-exact=true`). Documentar como desvio aceito.

**Pros:**
- Destrava TASK-04-02 imediatamente.
- Alinha com a decisão do time do Drizzle (tag `node-sqlite` = versão que eles endossam para essa finalidade).
- API do Drizzle 1.0 já é a API do GA (sem breaking changes esperados na direção contrária).
- Quando 1.0 GA sair, `bun update drizzle-orm` resolve.

**Contras:**
- Quebra a letra da política "sem beta em deps".
- API da beta pode mudar em revisões seguintes (mitigado por pin exato).
- CVE/bug em beta não é prioridade do maintainer como é em stable (mitigado por ritmo de releases do drizzle — múltiplas betas por semana).

### Opção B: Drizzle stable 0.45.2 com shim `DatabaseSync → BetterSqliteDatabase`
Usar `drizzle-orm/better-sqlite3` mas passar um adapter que reveste `DatabaseSync` de `node:sqlite` no contrato esperado pelo driver.

**Pros:**
- Drizzle stable, zero beta.

**Contras:**
- Shim depende de detalhes internos do driver better-sqlite3 do Drizzle — frágil a qualquer minor bump.
- Precisa reimplementar `iterate`, `pluck`, `expand`, `safeIntegers`, `raw`, `columns`, `inTransaction` — superfície de API grande.
- Testes de edge cases adicionais (null, bigint, buffer, named params).
- Se falhar em produção, debug é tripla camada (drizzle → shim → node:sqlite).

### Opção C: Adiar Drizzle — SQL raw com `Db` wrapper + Zod para tipos
Abandonar TASK-04-02 temporariamente. Escrever queries SQL via `db.prepare()`, parsear resultados com Zod, derivar tipos dos schemas Zod. Voltar ao Drizzle quando 1.0 GA.

**Pros:**
- Zero beta, zero shim, zero lib extra.

**Contras:**
- Desperdiça os schemas Drizzle já escritos (workspaces, sessions, messages_index, event_checkpoints).
- Queries ficam menos legíveis (SQL string + cast de tipos).
- Refactor obrigatório em 3-6 meses quando Drizzle 1.0 GA.
- Bloqueia TASK-04-03 (migrations via drizzle-kit).

### Opção D: Reverter ADR-0040a → voltar para better-sqlite3
Trazer `better-sqlite3` de volta para ter Drizzle stable first-class.

**Pros:**
- Drizzle stable oficial.

**Contras:**
- Reintroduz toda a dor do binding nativo que ADR-0040a eliminou (asarUnpack, npmRebuild, quarentena de antivírus no Windows).
- Troca uma dor (beta de lib) por uma **dor maior reportada pelo cliente** (runtime perdido no Windows).

## Decisão

Optamos pela **Opção A (Drizzle beta 1.0 pinado)** porque:

1. **Trade-off é menor.** Beta de lib em produção é risco contido (podemos diagnosticar, patch, até fork). Binding nativo perdido no Windows é dor reportada do cliente.
2. **Sinal do mantenedor.** O Drizzle team publicou uma tag dedicada (`node-sqlite`) e documentação pública apontando essa linha como o caminho para `node:sqlite`. Isso sinaliza que a beta é production-ready intencional, não WIP.
3. **Reversibilidade.** Quando Drizzle 1.0 GA, migração é `pnpm update drizzle-orm` — zero mudança de API.
4. **Pin exato evita drift.** `save-exact=true` + lockfile + `pnpm.peerDependencyRules` documentado impede upgrade acidental para uma beta mais nova com breaking change.

**A política "sem beta em deps" continua válida.** Esta é a **única exceção** aceita; qualquer outra beta precisa de ADR próprio.

## Controles aplicados

1. **Pin exato** (`drizzle-orm: 1.0.0-beta.17-8a36f93`) — enforcado por `.npmrc save-exact=true` + `pnpm-lock.yaml` versionado.
2. **Pin exato do drizzle-kit matching** (`drizzle-kit: 1.0.0-beta.17-8a36f93`) em `devDependencies`.
3. **Peer `mssql`/`@types/mssql` em `pnpm.peerDependencyRules.ignoreMissing`** — drizzle-orm beta puxa esses peers opcionalmente, bloqueados pelo nosso `strict-peer-dependencies=true`.
4. **TODO rastreável** em `docs/TODO-DRIZZLE-GA.md` — checklist para migrar ao GA, incluindo validação de breaking changes e remoção das exceções.
5. **Notifica toda vez que tocar nessa camada.** Antes de bumpar `drizzle-orm` mesmo para outra beta, ler o changelog do drizzle.
6. **Este ADR é o único gatilho oficial para uso de beta em `dependencies`.** Código que importar outra lib beta sem ADR específico deve ser rejeitado em code review.

## Consequências

### Positivas
- TASK-04-02 destravada, TASK-04-03 (migrations via drizzle-kit) viabilizada.
- `node-sqlite` first-class confirmado em produção.
- Baseline migration gerada (`drizzle/20260418201846_baseline/`) com schema + FTS5 triggers.
- Type inference via `$inferSelect` / `$inferInsert` funciona.

### Negativas / Trade-offs
- Uma dep beta em `dependencies`. Documentada e monitorada.
- Cada bump de drizzle (mesmo patch-level da beta) precisa ler changelog.
- CVE scanner vai flaggar "lib pre-1.0". Aceito.

### Neutras
- Drizzle 1.0 API é estável em direção ao GA; histórico de betas do Drizzle mostra poucas mudanças breaking entre betas sequenciais.

## Revisão

Revalidação **obrigatória** quando:

1. Drizzle 1.0 GA lançar (npm `@latest`). Ação: `pnpm update drizzle-orm drizzle-kit`, rodar gates, remover este ADR do status "with caveat" → superseded por ADR de adoção de Drizzle GA.
2. CVE crítico na beta. Ação: patch manual ou downgrade para beta anterior estável.
3. Nova dep beta for proposta no monorepo. Ação: NÃO pode piggy-back neste ADR; precisa de ADR próprio.

Prazo máximo para revisão automática: **2026-10-18** (6 meses). Passou disso sem GA, time revisita se continuar em beta ou adotar plano B/C retroativamente.

## Referências

- ADR-0040a: node:sqlite nativo (premissa deste ADR)
- [Drizzle ORM docs — node:sqlite](https://orm.drizzle.team/docs/connect-node-sqlite)
- [Drizzle npm — versões beta](https://www.npmjs.com/package/drizzle-orm?activeTab=versions)
- [Package analysis v2 — pacotes em estado instável](../../../G4OS/STUDY/Audit/package-analisis.md#1-bibliotecas-em-estado-inst%C3%A1vel-rodando-em-produ%C3%A7%C3%A3o-alto-risco)
- [`docs/TODO-DRIZZLE-GA.md`](../TODO-DRIZZLE-GA.md)

## Histórico de alterações

- 2026-04-18: Proposta e aceita no mesmo dia da implementação de TASK-04-02. Desvio pontual explícito da política "sem beta em deps", justificado pelo trade-off com ADR-0040a.
