# ADR 0150: Modal vs Page para fluxos de criação

## Metadata

- **Numero:** 0150
- **Status:** Accepted
- **Data:** 2026-04-26
- **Autor(es):** @igor.rezende
- **Stakeholders:** @tech-lead, @ux

## Contexto

V1 e V2 divergem em padrões de criação de entidades (workspace, project, session, source). V1 era page-centric — criar projeto navegava para uma página dedicada. V2 introduziu modais para algumas dessas operações sem documentar a heurística.

Estado atual em V2 (heterogêneo):
- **Workspace:** page (`/workspaces/new`)
- **Project:** modal (`CreateProjectDialog`)
- **Session:** ação direta (sem UI dedicada — `Cmd+N` cria + navega para a session)
- **Source (custom MCP stdio):** modal (`CreateStdioDialog`)

Sem regra clara, futuras features vão escolher arbitrariamente, criando inconsistência de UX.

Evidência:
- Code review #1 [TASK-CR1-09](../../code-review-1.md): user relatou "criar um projeto leva para uma página específica em V1, modal em V2" — sentiu como regressão.
- Auditoria UI/UX V1↔V2 confirmou divergência sem ADR justificando.

## Opções consideradas

### Opção A: Tudo modal
**Descrição:** uniformizar para modais.

**Pros:**
- Mais rápido (sem transição de rota)
- Preserva contexto da tela anterior
- Menor blast radius (sem precisar de rotas + states)

**Contras:**
- Modais grandes ficam inacessíveis em telas pequenas
- Forms multi-step ficam apertados
- Deep links impossíveis (não dá pra compartilhar URL de "criar projeto")

### Opção B: Tudo page
**Descrição:** voltar pra V1 — toda criação navega.

**Pros:**
- Deep links naturais
- Espaço pra forms longos / wizards
- Consistência

**Contras:**
- Carga cognitiva maior em ações simples (criar 1 source = mudar rota inteira)
- Quebra fluxo do usuário em context-switching frequente
- Mais boilerplate (rotas, layouts, breadcrumbs)

### Opção C: Híbrida com regra clara
**Descrição:** decidir por critério objetivo:
- **Modal** para entidades com form curto (≤5 campos), criação rápida sem multi-step
- **Page** para entidades com wizard multi-step, configuração complexa, deep-link relevante, ou que disparam side effects pesados (criar workspace = bootstrap de db, scaffold, etc.)

**Pros:**
- Coerente com produtos maduros (Linear, Notion, GitHub)
- UX otimizada por caso
- Trade-off explícito por entidade

**Contras:**
- Requer julgamento — pode haver casos limítrofes
- Dois padrões coexistem (mas com regra clara)

## Decisão

Optamos pela **Opção C — Híbrida com regra clara**.

### Heurística

Use **Page** quando ≥1 dos critérios abaixo for verdadeiro:
- Form é wizard multi-step (≥3 etapas distintas)
- Criação dispara side effects pesados (scaffold de filesystem, bootstrap de db, OAuth)
- Deep link da criação tem valor (compartilhar template / convite)
- Form precisa de >50% da viewport para caber confortavelmente

Use **Modal** quando todas verdadeiras:
- Form curto (≤5 campos)
- Criação é síncrona e rápida (<1s)
- Contexto da tela anterior continua relevante após criar
- Não há benefício em deep link

### Aplicação ao estado atual

| Entidade | Padrão atual | Decisão | Justificativa |
|----------|-------------|---------|---------------|
| Workspace | Page | **Page** ✅ mantém | Bootstrap pesado (db + scaffold + onboarding wizard) |
| Project | Modal | **Page** ⚠️ migrar | Side effect: scaffold de filesystem, sources, AGENTS.md/CLAUDE.md. Wizard multi-step planejado pra TASK-CR1-01 |
| Session | Inline (Cmd+N) | **Inline** ✅ mantém | Síncrono, rápido, sem side effects |
| Source (managed) | Modal/OAuth | **Modal** ✅ mantém | Form curto + redirect OAuth externo |
| Source (MCP stdio custom) | Modal | **Modal** ✅ mantém | Form curto (5 campos), criação síncrona |

### Tarefa decorrente

- [ ] **Migrar `CreateProjectDialog` → page (`/projects/new`)** com wizard multi-step (TASK pós-CR1-01) — depende de bundled skills (TASK-CR1-18)

## Consequências

### Positivas
- Heurística objetiva — futuras features decidem sem reabrir debate
- UX coerente: ações rápidas ficam no contexto, ações complexas ganham espaço
- Deep links viáveis para fluxos críticos (workspace, project)

### Negativas / Trade-offs
- Refatoração de `CreateProjectDialog` (modal → page) — TASK separada
- Dois padrões a manter (mas com regra clara)
- Algumas decisões limítrofes vão precisar de bom senso

### Neutras
- Componente `<Dialog>` continua disponível para outros usos (confirmações, share, etc.)

## Validação

- Métrica: número de issues "abriu modal sem querer / queria página" → expectativa zero pós-migração de project
- Revisão em 3 meses: avaliar se a heurística cobriu todos os casos novos
- Code review: PR de criação de nova entidade DEVE citar este ADR para justificar escolha

## Referencias

- Code review #1: [/code-review-1.md](../../code-review-1.md) TASK-CR1-09
- Linear's "create from anywhere" pattern (modal-first com page fallback para wizards)
- ADRs relacionadas: ADR-0100 (UI shell stack), ADR-0130 (Projects schema)

---

## Histórico de alterações

- 2026-04-26: Proposta inicial e aceita no mesmo dia (decisão clara, baixo blast radius)
