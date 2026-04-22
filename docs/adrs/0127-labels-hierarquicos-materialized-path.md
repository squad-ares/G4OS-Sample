# ADR 0127: Labels Hierárquicos via Materialized-Path (tree_code)

## Metadata

- **Numero:** 0127
- **Status:** Accepted
- **Data:** 2026-04-22
- **Autor(es):** @g4os-team
- **Stakeholders:** @tech-lead

## Contexto

Usuários precisam organizar sessões com labels multi-nível (ex: `Área > Engenharia > Backend`).
O v1 não tinha sistema de labels. Requisitos:

1. Labels podem ter filhos (hierarquia arbitrária mas rasa em prática — 2-3 níveis)
2. Busca de todos os filhos de um label pai precisa ser eficiente
3. Reparentamento (mover label para outro pai) deve ser possível
4. SQLite sem extensões externas (ADR-0040a: `node:sqlite` nativo, zero bindings)

Restrição crítica: SQLite não tem suporte a CTEs recursivas na versão embarcada do Node 24
sem modo `RECURSIVE` — e mesmo com suporte, CTEs recursivas são lentas em hierarquias profundas.

## Opções consideradas

### Opção A: Materialized Path (tree_code)
Cada label armazena `tree_code TEXT NOT NULL` no formato `parent.code.child.code.leaf.code`.
Busca de todos os descendentes de um nó usa `LIKE 'parent.child.%'`.

**Pros:**
- Busca de sub-árvore com um único índice (`LIKE prefix%` usa índice B-tree)
- Reparentamento atualiza o `tree_code` dos descendentes — operação O(n filhos)
- Sem JOIN recursivo
- Compatível com SQLite sem extensões

**Contras:**
- Reparentamento requer atualização em cascata de todos os descendentes
- tree_code deve ser único por workspace

### Opção B: Closure Table
Tabela extra `label_ancestors(ancestor_id, descendant_id, depth)` com todas as relações
ancestral-descendente pré-computadas.

**Pros:** Queries eficientes de qualquer relação ancestral-descendente

**Contras:**
- Uma row por par (ancestor, descendant) — 10 labels com 3 níveis = ~30 linhas extra
- Reparentamento exige deleção e reinserção de múltiplas linhas na tabela closure
- Complexidade adicional para benefício marginal em hierarquias rasas

### Opção C: Adjacency List com CTE recursiva
`parent_id TEXT REFERENCES labels(id)` e consultas via `WITH RECURSIVE`.

**Pros:** Simples de entender

**Contras:**
- CTEs recursivas são lentas em SQLite para hierarquias profundas
- Não beneficia de índices B-tree para busca de sub-árvore

## Decisão

Optamos pela **Opção A** porque:

1. Hierarquias de labels na prática têm 2-3 níveis — o custo de reparentamento é baixo
2. `LIKE 'prefix%'` usa índice B-tree no SQLite, dando busca O(log n) sem extensões
3. A implementação é simples: `LabelsRepository.reparent` atualiza `tree_code` dos filhos

O formato do `tree_code` usa ponto (`.`) como separador para compatibilidade com LIKE.

## Consequências

### Positivas
- Busca de labels filhos de um nó é O(log n) com índice
- Schema mínimo: 2 tabelas (`labels`, `session_labels`)
- Sem dependência de CTE recursiva ou extensão SQLite

### Negativas / Trade-offs
- Reparentamento envolve UPDATE em cascata nos filhos (aceitável para hierarquias rasas)
- tree_code deve ser unique por (workspace_id, tree_code) para evitar colisões

### Neutras
- LabelsRepository detecta ciclos antes de reparentar (guarda contra casos de borda)

## Validação

- Criar label `A > B > C` e buscar filhos de `A` retorna `B` e `C`
- Reparentar `B` para debaixo de outro nó atualiza `tree_code` de `C` também

## Referencias

- ADR-0040a: node:sqlite sem bindings externos
- TASK-11-01-07: Labels + filtros
- `packages/data/src/labels/repository.ts`
- `packages/data/src/schema/labels.ts`

---

## Histórico de alterações

- 2026-04-22: Proposta e aceita durante Epic 11-features/01-sessions
