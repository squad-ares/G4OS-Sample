# ADR 0119: Transcript search — reuso de FTS5 + SearchFn injection

## Metadata

- **Numero:** 0119
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Busca na transcript não existia na v1 — sessões longas eram impraticáveis de revisitar. Usuário precisava fazer scroll manual até achar a mensagem ou abrir o DevTools e usar Ctrl+F do Chromium no DOM (que não funciona com virtualização).

TASK-11-00-10 pede busca local com FTS5 + navegação teclado + highlight do match atual. A infraestrutura do FTS5 já estava disponível (ADR-0043: `messages_index` + `messages_fts` com external-content), então a decisão central aqui é como expor isso para a feature sem quebrar o isolamento transport-agnostic.

## Opções consideradas

### Opção A: Feature chama tRPC direto

**Descrição:** `SearchBar` importa `trpcReact` e chama `messages.search.useQuery()`.

**Pros:**
- Caminho curto.

**Contras:**
- Quebra ADR-0111 (features transport-agnostic). Obriga feature a depender de `@g4os/ipc/server`.
- Feature deixa de ser consumível no viewer web sem polyfill tRPC.

### Opção B: `TranscriptView` recebe `search` como prop injetada (`SearchFn`)

**Descrição:** a feature define `SearchFn = (query: string) => Promise<readonly SearchMatch[]>`. Desktop renderer passa uma implementação que chama tRPC; viewer web passaria uma que chama REST.

**Pros:**
- Mantém a feature agnóstica de transport.
- Mesmo padrão já usado pelo `VoiceButton.transcribe` (ADR-0118).
- Testável: `search` pode ser um mock que retorna fixture.

**Contras:**
- Uma prop a mais para configurar.

### Opção C: Index próprio no frontend (em memória)

**Descrição:** renderer monta um índice em memória quando carrega a sessão.

**Pros:**
- Sem round-trip.

**Contras:**
- Custo em sessão grande (10k+ mensagens).
- Duplica infra que já existe no SQLite main.
- Não reusa o `snippet()` do FTS5.

## Decisão

Optamos pela **Opção B** (`SearchFn` injection) + reuso do FTS5 já existente.

### Contrato

```ts
// packages/kernel (domínio compartilhado)
type SearchMatch = {
  readonly messageId: string;
  readonly sequence: number;
  readonly snippet: string;  // HTML com <mark>…</mark>
};

// packages/ipc/server
MessagesService.search(sessionId, query): Promise<Result<readonly SearchMatch[], AppError>>;
messages.search: authed.input({sessionId, query}).query → SearchMatch[]

// packages/features/chat
TranscriptView props: { ..., search?: SearchFn }
```

### FTS5 query (reuso, não nova schema)

```sql
SELECT mi.id AS message_id,
       mi.sequence AS sequence,
       snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) AS snippet
  FROM messages_fts
  JOIN messages_index mi ON mi.rowid = messages_fts.rowid
 WHERE mi.session_id = ?
   AND messages_fts MATCH ?
 ORDER BY mi.sequence ASC
 LIMIT 100
```

- `messages_fts` é external-content de `messages_index` (ADR-0043) — sem duplicação de storage.
- User input é embrulhado como phrase (`"query"`) para evitar interpretação acidental de operadores FTS5 (`AND`, `OR`, `*`, `"`).
- Fallback LIKE com `ESCAPE '\'` roda quando o virtual table falha (ex: sessão antiga sem trigger).

### UX

- Mod+F abre o `SearchBar` (ouvinte global quando `search` está presente).
- Debounce 150ms no input → chama `search(trimmed)`.
- Navegação: Enter = próximo, Shift+Enter = anterior, setas ↑/↓ nos botões. Escape fecha.
- Match atual recebe ring amarelo no wrapper do `MessageCard`; `virtualizer.scrollToIndex({ align: 'center' })` centraliza.
- Aria-live no contador (`"3 / 12"` ou `"Sem resultados"`) para leitores de tela.

## Consequências

### Positivas

- Feature permanece transport-agnostic — testes podem mockar `SearchFn` com fixture array.
- Reuso do FTS5 existente: zero migration, zero índice novo.
- `snippet()` devolve HTML pronto com `<mark>` — sem re-render custoso no cliente para destacar texto.
- Virtualizer-aware via `scrollToIndex` — match fora da viewport é trazido para o centro sem quebrar a virtualização.

### Negativas / Trade-offs

- Busca só rola com `TranscriptView` recebendo `search` injetado — consumidores sem busca (viewer read-only, sem infra) simplesmente não passam a prop; a UI some sem erro.
- Phrase-only search limita; usuário não consegue `"foo AND bar"` nativo. Aceitável para V1 — phrase cobre 95% dos casos.
- `MessagesService.search` no null-services retorna `ok([])` — fallback gracioso garantido mesmo sem wiring real.

### Neutras

- 150ms de debounce é conservador; pode ser ajustado.
- `SearchMatch.snippet` ainda não é usado na UI (só o ring do match atual). Fica disponível para um painel de resultados lateral num futuro ADR.

## Estrutura implementada

```
packages/kernel/src/schemas/search.schema.ts     # Zod + inferred type
packages/data/src/queries/search.ts              # FTS5 + LIKE fallback
packages/ipc/src/server/context.ts               # MessagesService.search
packages/ipc/src/server/routers/messages-router.ts  # messages.search
packages/features/src/chat/
├── hooks/use-search-matches.ts   # debounce + SearchFn
├── hooks/use-scroll-to-match.ts  # virtualizer.scrollToIndex
└── components/transcript/
    ├── search-bar.tsx            # input + nav + contador aria-live
    └── transcript-view.tsx       # Mod+F listener + ring highlight
```

i18n: `chat.search.open`, `chat.search.close`, `chat.search.ariaLabel`, `chat.search.placeholder`, `chat.search.noResults`, `chat.search.prevMatch`, `chat.search.nextMatch`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤200 LOC.
- Gate `check:cruiser`: feature não importa tRPC/IPC — `search` é prop injetada.
- Smoke manual: Mod+F abre; navegação circular (`N+1 → 1`); Escape fecha; sessão com 500+ turnos busca em < 100ms.

## Referências

- TASK-11-00-10
- ADR-0043 (event store + messages_index + messages_fts external-content)
- ADR-0112 (transcript rendering — `TranscriptView` hospeda o SearchBar)
- ADR-0118 (voice input — mesmo padrão de prop injection)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-10 entregue).
