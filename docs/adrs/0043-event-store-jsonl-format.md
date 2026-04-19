# ADR 0043: Formato do event store (JSONL append-only + checkpoints multi-consumer)

## Metadata

- **Numero:** 0043
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-04)
- **Dependências:** ADR-0010 (event-sourced sessions), ADR-0040a (node:sqlite), ADR-0042 (drizzle beta)

## Contexto

ADR-0010 estabeleceu que sessões são sequências imutáveis de eventos (`SessionEvent`) em JSONL append-only, com índice em SQLite. Restaram decisões concretas de implementação com impacto em replay, crash recovery e futuras extensões (FTS, telemetria):

1. **Layout físico do log** — um arquivo por sessão? Shardear por workspace?
2. **Validação de entrada/saída** — onde aplicar Zod? Antes da escrita, durante o read, em ambos?
3. **Crash recovery** — como detectar eventos no JSONL que ainda não foram materializados na projection?
4. **Extensibilidade** — como permitir novos consumers (ex.: FTS como consumer separado) sem refatorar o writer?

A v1 misturou eventos com `message.content` inline + base64 de anexos no mesmo JSONL; transcripts grandes passavam dezenas de MB, parse custava segundos e qualquer linha corrompida derrubava o load da sessão inteira.

## Opções consideradas

### Opção A — Um JSONL por sessão + reducer único, sem checkpoints

**Descrição:** cada sessão tem `events.jsonl`. Reducer lê o arquivo e materializa projections em memória. Não há tabela de checkpoint.

**Pros:**
- Mais simples.

**Contras:**
- Recuperação pós-crash exige replay completo do log (O(N) por sessão).
- Sem forma de ter múltiplos consumers independentes (FTS, telemetria, etc.).

### Opção B — JSONL por sessão + checkpoint global único

**Descrição:** uma linha por sessão na tabela `event_checkpoints` indicando `lastSequence` processada.

**Pros:**
- Recuperação O(delta) por sessão.

**Contras:**
- Acopla FTS, índice de mensagens e qualquer futuro consumer à mesma progressão.
- Um consumer lento segura os outros.

### Opção C (escolhida) — JSONL por sessão + checkpoint composto `(consumerName, sessionId)`

**Descrição:**
- `workspaces/<wid>/sessions/<sid>/events.jsonl` — um arquivo, append-only, uma linha JSON por evento.
- Tabela `event_checkpoints` com PK composta `(consumer_name, session_id)` e campo `last_sequence`.
- Reducer default `messages-index` materializa `sessions` + `messages_index` em uma transação síncrona por evento.
- Validação Zod (`SessionEventSchema`) aplicada **na escrita** (rejeita eventos inválidos antes de tocar disco) **e na leitura** (protege o reducer de corrupção externa).

**Pros:**
- Novos consumers (ex.: FTS indexer, telemetria) adicionam uma linha por sessão na tabela sem coordenar com o `messages-index`.
- Crash recovery = `readAfter(sessionId, checkpoint.lastSequence)`.
- Corrupção no log é detectada na linha exata via `JSON.parse` + Zod — não propaga para projections.

**Contras:**
- Exige cuidado para manter `event_checkpoints` consistente com a projection (resolvido: mesma transação SQLite).

## Decisão

Adotamos **Opção C**.

### Especificação

- **Path canônico:** `<workspace root>/sessions/<sessionId>/events.jsonl`
- **Serialização:** uma linha UTF-8 por evento, terminada em `\n`, com `JSON.stringify(SessionEventSchema.parse(event))`.
- **Sequência:** `sequenceNumber` começa em `0` (evento `session.created`), monotonicamente crescente, sem gaps.
- **Validação:** `append()` valida com Zod antes do `appendFile`; `read()` valida ao parsear cada linha e lança em linha corrompida (fail-loud).
- **Checkpoints:** consumer default se chama `messages-index`. `applyEvent()` persiste o checkpoint na mesma transação da projection.
- **Replay:**
  - `rebuildProjection(db, store, sessionId)` — full rebuild (apaga linhas da projection e reaplica o log).
  - `catchUp(db, store, sessionId)` — aplica apenas eventos com `sequenceNumber > lastSequence` (usa `-1` como piso quando não há checkpoint, para não pular o `session.created` em seq=0).
- **Anexos:** eventos `message.added` carregam apenas metadados de anexo; blobs vivem no `AttachmentStorage` (ADR-0044).

### Tipos de evento suportados

`session.created`, `message.added`, `message.updated`, `session.renamed`, `session.labeled`, `session.flagged`, `session.archived`, `session.deleted`, `tool.invoked`, `tool.completed`. Novos tipos:

1. Adicionar variant em `SessionEventSchema` (kernel).
2. Novo branch no `switch` de `applyEvent`.
3. Migration se afetar projection.
4. Teste de replay idempotente.

## Consequências

### Positivas

- Replay é determinístico: o log é a fonte da verdade; projections são cache.
- Crash entre `append()` e `applyEvent()` é automaticamente recuperado no próximo boot via `catchUp()`.
- Qualquer consumer futuro (FTS, telemetria, LLM fine-tune export) entra sem tocar no writer.
- Corrupção de uma linha é isolada àquela sessão, não derruba o app.

### Negativas / Trade-offs

- Não há compactação do JSONL — sessões longas crescem linearmente. Aceitável na v2 (99th percentile de sessões < 10MB); compactação por snapshotting é trabalho futuro.
- `applyEvent` é síncrono (requisito do `drizzle-orm/node-sqlite`). Consumers I/O-bound (ex.: envio para telemetria remota) precisarão ser desacoplados via fila.

### Neutras

- Formato JSONL é human-readable, útil para debugging e backup (ADR-0045).

## Validação

- 16 testes de unidade cobrem append/read/readAfter/validação Zod/corrupção/perf (1000 eventos < 2s), reducer por tipo de evento, `rebuildProjection` e `catchUp` com e sem checkpoint.
- Próximos consumers (FTS, telemetria) servirão de validação empírica da premissa de multi-consumer.

## Referências

- Tarefa: `STUDY/Audit/Tasks/04-data-layer/TASK-04-04-event-sourced-sessions.md`
- ADRs relacionadas: ADR-0010, ADR-0040a, ADR-0042, ADR-0045

---

## Histórico de alterações

- 2026-04-18: Proposta inicial + aceita (TASK-04-04).
