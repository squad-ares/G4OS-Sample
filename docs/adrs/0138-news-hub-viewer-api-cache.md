# ADR 0138: News hub — viewer API + cache + polling + sub-sidebar

## Metadata

- **Numero:** 0138
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-15 (news hub Phase 1)

## Contexto

V1 expunha "Novidades" lido do viewer API (`GET /api/news`) com auth simples. V2 precisava preservar o fluxo com:

1. Feed fetch com JSON schema validado em kernel (reuso de Zod).
2. Renderer com lista + detail + unread tracking (localStorage client-side — não vale DB pra um conjunto de ~10 items).
3. Polling periódico (30 min é AC da OUTLIER-15) pra pegar novos posts sem usuário precisar refresh manual.
4. Sub-sidebar com badge de unread quando `/news` não está na tela.

## Opções consideradas

### Opção A: IndexedDB client-side só
**Contras:** tracking de "seen" em IndexedDB é overkill pra ~10 IDs. localStorage é mais simples, instantâneo, survive reload.

### Opção B: News como route stub (placeholder)
**Contras:** não atende AC da OUTLIER-15. Usuário não tem onde ver updates.

### Opção C: main `NewsService` (HTTP fetch + in-memory cache) + kernel schema + feature package + polling query (aceita)
**Descrição:**
- `packages/kernel/src/schemas/news.schema.ts` — `NewsItemSchema`, `NewsFeedSchema` Zod.
- `apps/desktop/src/main/services/news-service.ts` — `createNewsService()` retorna `{ list(), get(id) }`. Fetch do viewer com cache TTL in-memory (evita pound do viewer em polling reentrante).
- `packages/ipc/src/server/routers/news-router.ts` — `news.list`, `news.get(id)` (tRPC).
- `packages/features/src/news/` — `NewsPanel` (sub-sidebar list) + `NewsDetail` (markdown-rendered detail).
- `apps/desktop/src/renderer/news/seen-store.ts` — localStorage-backed `useSeenNewsIds()` + `markAsSeen(id)` + custom event pra cross-tab sync.
- `apps/desktop/src/renderer/routes/_app/news.index.tsx` — lista grid (não dead-end vazio). `useQuery` com `refetchInterval: 30min`.
- `apps/desktop/src/renderer/routes/_app/news.$newsId.tsx` — detail + markRead on view.

## Decisão

**Opção C.** Split limpo:
- Data contract em kernel.
- HTTP fetch no main via tRPC.
- UI em feature package.
- Tracking client-side (localStorage).
- Polling via TanStack Query `refetchInterval`.

## Consequências

### Positivas
- Feed desacoplado do renderer: qualquer superfície consumindo `trpc.news.list` vê os mesmos dados.
- localStorage + custom event: sub-sidebar unread dots atualizam instantaneamente quando user abre detail em outra janela.
- Polling trivial — `useQuery({ refetchInterval: 30 * 60 * 1000 })`. Não precisa de interval manual no main.
- Kernel schema reutilizado: se outro surface (ex: CLI futuro) quiser o feed, o contract é estável.

### Negativas / Trade-offs
- Cache in-memory no main service perde-se em restart. Aceitável — feed é pequeno e refetch é barato. Se virar problema, persist em `.g4os/news-cache.json`.
- Shell-level unread badge (count total no topbar/sidebar) fica como FOLLOWUP — `NewsPanel` já mostra dot per-item, mas não há counter agregado no shell nav. Scope creep evitado.

### Neutras
- `NewsItem.markdown` é conteúdo completo (não summary). `news.index.tsx` deriva preview via strip markdown básico (`previewFromMarkdown`) pros cards.

## Validação

- `GET /api/news` do viewer V1 continua consumível.
- `/news` renderiza grid não-vazia quando há items.
- `/news/:newsId` marca como seen no view.
- Refetch automático a cada 30min via useQuery.
- Sub-sidebar panel mostra unread dot per item via `useSeenNewsIds()`.

## Referencias

- TASK-OUTLIER-15 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
