# ADR 0076: Streaming com batching de deltas e backpressure policy

## Metadata

- **Numero:** 0076
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-05 (epic 07-agent-framework)

## Contexto

Agentes LLM modernos (Claude Sonnet 4+, GPT-5, Gemini 3) podem emitir 1000+ chunks de texto por segundo durante streaming. A V1 encaminhava todos os chunks diretamente ao renderer via IPC sem qualquer throttling — o resultado era:

1. **UI lock-up**: O renderer JavaScript ficava processando mensagens IPC mais rápido do que podia renderizar, causando travamento perceptível na interface.
2. **Queue infinita**: Sem limite no número de eventos pendentes, sessões longas consumiam memória crescente no worker.
3. **Eventos estruturais misturados com text deltas**: `tool_use_start`, `done`, `error` chegavam ao renderer fora de ordem quando o IPC estava saturado.

Os `AgentEvent` gerados pelos agentes (Observable RxJS) precisam de uma camada de otimização antes de serem encaminhados ao renderer.

Requisitos:
- Text deltas coalescidos a cada ~16ms (1 frame de 60fps) para não travar o renderer
- Eventos estruturais (`tool_use_start`, `tool_use_complete`, `done`, `error`, `started`, `usage`) **jamais** descartados
- Queue com limite explícito e política de drop apenas para deltas
- Timers limpos corretamente em unsubscribe/abort (sem memory leaks)

## Opções consideradas

### Opção A: bufferTime do RxJS

```typescript
source.pipe(bufferTime(16))
```

Agrupa todos os eventos em arrays por janela de 16ms. Simples, mas:
- Emite arrays vazios quando sem eventos (overhead)
- Não distingue eventos estruturais de deltas na lógica de drop
- Complica o consumer que precisa desempacotar arrays

**Rejeitado.**

### Opção B: batchTextDeltas + dropIfBackpressured (escolhido)

Dois operadores RxJS customizados, compostos via `pipe`:

**`batchTextDeltas(intervalMs = 16)`**: acumula `text_delta` em buffer string. Ao receber qualquer evento não-delta, flush imediato. Flush periódico a cada `intervalMs` via `setTimeout` (não `setInterval` — timer only existe quando há buffer). Limpeza do timer em `teardown` da subscription.

**`dropIfBackpressured(maxQueueSize = 100)`**: queue com limite. Quando cheia, tenta remover o `text_delta` mais antigo. Se não houver delta na queue, eventos estruturais são enfileirados mesmo acima do limite — garantia hard de que `done`/`error` nunca são perdidos.

### Opção C: `throttleTime` do RxJS

Descarta eventos, não batcha. Perda de tokens de texto genuína.

**Rejeitado.**

## Decisão

Opção B, com os dois operadores como funções exportadas de `@g4os/agents/streaming`. Composição no consumidor:

```typescript
agent.run(input).pipe(
  batchTextDeltas(16),
  dropIfBackpressured(100),
).subscribe((event) => emitToRenderer(event));
```

## Consequências

**Positivas:**
- UI recebe no máximo ~60 eventos/segundo de texto em vez de 1000+
- Eventos estruturais sempre chegam, sem reordenação
- Implementação sem deps externas além do RxJS já presente
- Timers se auto-limpam: `clearTimeout` no teardown da Observable

**Neutras:**
- `batchTextDeltas` não coalesce `thinking_delta` — thinking pode saturar em modelos com raciocínio longo. Aceitável por ora: thinking geralmente é mais lento que text streaming.
- `dropIfBackpressured` usa `Promise.resolve()` como yield point — microtask por item drenado. Em queues longas pode acumular microtasks, mas o limite de 100 torna isso desprezível.

**Negativas:**
- Latência de exibição do primeiro token sobe de ~0ms para ~16ms — imperceptível para humanos (250ms de JND)

## Estrutura implementada

```
packages/agents/src/streaming/
├── batch-deltas.ts       # batchTextDeltas(intervalMs)
├── backpressure.ts       # dropIfBackpressured(maxQueueSize)
└── index.ts              # barrel export
```

Exportado como `@g4os/agents/streaming` via subpath no build.

## Armadilhas preservadas da V1

1. V1 não tinha cleanup de timers — leak sutil em sessions longas. V2: `clearTimeout` no teardown da Observable subscription.
2. V1 encaminhava `done` e `error` pelo mesmo canal sem prioridade — v2 garante que não são droppáveis via `DROPPABLE_TYPES: Set = new Set(['text_delta', 'thinking_delta'])`.

## Referências

- ADR-0070 (plugin architecture — `AgentEvent` type)
- TASK-07-05
