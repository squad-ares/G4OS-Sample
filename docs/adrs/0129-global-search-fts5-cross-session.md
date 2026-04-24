# ADR 0129: Global Search — FTS5 Cross-Session com Fallback LIKE

## Metadata

- **Numero:** 0129
- **Status:** Accepted
- **Data:** 2026-04-22
- **Autor(es):** @g4os-team
- **Stakeholders:** @tech-lead

## Contexto

A busca de sessões no v1 era limitada ao nome da sessão no workspace atual. Usuários precisavam
navegar manualmente por centenas de sessões para encontrar uma conversa específica.

O v2 já tem `messages_fts` (FTS5 virtual table) para busca dentro de uma sessão (ADR-0119).
A demanda é estender para busca global: "encontrar todas as sessões onde falei sobre X".

Requisitos:
- Busca em conteúdo de mensagens (cross-session)
- Busca em nomes de sessão
- Resultados incluem: `sessionId`, `sessionName`, `messageId`, `snippet` destacado
- Deve funcionar no SQLite nativo (node:sqlite, ADR-0040a)

## Opções consideradas

### Opção A: FTS5 com JOIN em sessions + fallback LIKE (escolhida)
Reutilizar a tabela `messages_fts` existente com JOIN em `sessions` para filtrar por workspace
e retornar `session_name`. Quando a query FTS5 for inválida (ex: operadores mal-formados),
cair em LIKE como fallback.

```sql
SELECT mi.id, mi.session_id, s.name, snippet(messages_fts, ...) AS snippet
FROM messages_fts
JOIN messages_index AS mi ON mi.rowid = messages_fts.rowid
JOIN sessions AS s ON s.id = mi.session_id
WHERE s.workspace_id = ? AND messages_fts MATCH ? AND s.status = 'active'
ORDER BY rank
LIMIT ?
```

**Pros:**
- Reutiliza índice FTS5 já existente (zero duplicação de dados)
- `snippet()` do SQLite gera preview com marcadores `<mark>` grátis
- `ORDER BY rank` prioriza relevância
- Fallback LIKE cobre casos de query inválida sem erro para o usuário

**Contras:**
- FTS5 não tem stemming em pt-BR por padrão
- `snippet()` pode cortar o contexto de forma estranha

### Opção B: Índice FTS5 separado cross-session
Criar uma nova tabela `global_fts` que indexa mensagens de todas as sessões do workspace.

**Pros:** Índice otimizado para busca global

**Contras:**
- Duplicação do conteúdo já indexado em `messages_fts`
- Manutenção de dois índices FTS5 (triggers de sync adicionais)
- Mesma query na prática — o JOIN é barato com índices corretos

### Opção C: Busca apenas em nomes de sessão
Não indexar conteúdo de mensagens, buscar só por nome.

**Pros:** Trivial

**Contras:**
- Não atende o requisito principal ("encontrar sessões onde falei sobre X")

## Decisão

Optamos pela **Opção A** porque reutiliza a infraestrutura FTS5 existente sem duplicação.
O fallback LIKE garante que queries com operadores inválidos (ex: `foo AND`) não quebram
para o usuário. A separação em duas funções (`searchMessagesFts` / `searchMessagesLike`)
isola os dois caminhos para testabilidade.

## Consequências

### Positivas
- Zero overhead de indexação adicional (FTS5 já existe)
- `snippet()` com marcadores permite highlight no cliente
- Resultados ordenados por relevância FTS5

### Negativas / Trade-offs
- FTS5 usa stemmer simples (unicode61) — busca fonética/variações não suportada
- O fallback LIKE usa `content_preview` (truncado a 200 chars) — não busca em mensagens longas

### Neutras
- `GlobalSearchResult` tem `messages` + `sessions` separados para facilitar UI
- Limite default de 50 resultados por tipo evita resultados excessivos

## Validação

- Busca por termo que aparece em 3 sessões retorna as 3 na lista `messages`
- Query inválida (`foo AND`) não quebra — fallback LIKE retorna resultados LIKE
- Busca por nome de sessão retorna a sessão na lista `sessions`

## Referencias

- ADR-0040a: node:sqlite nativo
- ADR-0043: Event store + messages_index
- ADR-0119: Transcript search FTS5
- TASK-11-01-03: Global search / command palette
- `packages/data/src/queries/global-search.ts`

---

## Histórico de alterações

- 2026-04-22: Proposta e aceita durante Epic 11-features/01-sessions
