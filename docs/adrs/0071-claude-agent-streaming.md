# ADR 0071: ClaudeAgent — DI providers + pure stream mapping + prompt cache 1h

## Metadata

- **Numero:** 0071
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-02 (epic 07-agent-framework)

## Contexto

Em v1 o `ClaudeAgent` (em [`packages/shared/src/agent/claude-agent.ts`](../../../G4OS/packages/shared/src/agent/claude-agent.ts)) tem **4.716 linhas em um único arquivo**. Mistura:

- Parsing/reconstrução da stream SSE da Anthropic (chunking, JSON incremental de tool_use).
- Seleção de provider (`api.anthropic.com`, AWS Bedrock, endpoints Anthropic-compatíveis).
- Aplicação de markers de prompt cache (5m vs 1h) por decisão runtime.
- Um `fetch` interceptor que mutava o body no caminho do Bedrock — conflitando com SigV4 signing e causando erros intermitentes em produção.
- Sem `AbortController` confiável — cancelar no meio da stream deixava handle pendurado.

Objetivos para v2 (critérios do TASK-07-02):

1. Cada arquivo ≤ 400 LOC. Idealmente ≤ 200 LOC para a maioria.
2. `AgentEvent` da interface (ADR-0070) cobre o mesmo conjunto de v1.
3. Prompt cache TTL 1h funcional em `api.anthropic.com` direto.
4. Bedrock SigV4 preservado — sem mutação post-sign do body.
5. `AbortSignal` propagado de `Observable.unsubscribe` / `dispose` / `interrupt` até o provider.
6. Cobertura ≥ 85% (na prática, todas as transformações puras a 100%).

## Opções consideradas

### Opção A: reutilizar a arquitetura v1 (monólito com branching interno)
**Pros:** nenhum.
**Contras:** repete todos os bugs estruturais.

### Opção B: `ClaudeAgent` conhece diretamente `@anthropic-ai/sdk` + `@aws-sdk/client-bedrock-runtime`
**Pros:** menos abstração.
**Contras:** impossível testar sem rede; a v2 proíbe `fetch`-mocks por serem frágeis; seriam 6+ deps nativas puxadas mesmo em CI sem rodar Claude.

### Opção C: `ClaudeProvider` como contrato injetável + pipeline puro de transformação (aceita)

## Decisão

**Opção C.** A implementação mora em [`packages/agents/src/claude/`](../../packages/agents/src/claude/) organizada por responsabilidade:

| Módulo | Papel | LOC |
|---|---|---|
| [`types.ts`](../../packages/agents/src/claude/types.ts) | Shapes do wire Claude (ClaudeMessage, ClaudeStreamEvent, ClaudeProvider contract) | 122 |
| [`capabilities.ts`](../../packages/agents/src/claude/capabilities.ts) | `detectCapabilities(modelId)` com perfis por família de modelo | 60 |
| [`config/mapper.ts`](../../packages/agents/src/claude/config/mapper.ts) | `AgentConfig + Message[] → ClaudeCreateMessageParams` (puro) | 118 |
| [`prompt-cache/cache-markers.ts`](../../packages/agents/src/claude/prompt-cache/cache-markers.ts) | `applyPromptCache1hTtl` + overrides granulares (system/tools/last-user-turn) | 108 |
| [`runner/tool-accumulator.ts`](../../packages/agents/src/claude/runner/tool-accumulator.ts) | Acumula `input_json_delta` por índice; `parseToolInput` com fallback `{}` em JSON malformado | 57 |
| [`runner/event-mapper.ts`](../../packages/agents/src/claude/runner/event-mapper.ts) | `ClaudeStreamEvent → AgentEvent[]` (puro, stateful via acumulador) | 105 |
| [`runner/stream-runner.ts`](../../packages/agents/src/claude/runner/stream-runner.ts) | Async generator que orquestra provider + mapper + abort | 71 |
| [`claude-agent.ts`](../../packages/agents/src/claude/claude-agent.ts) | `IAgent` impl: Observable, AbortController por session, `interrupt`, dispose | 117 |
| [`factory.ts`](../../packages/agents/src/claude/factory.ts) | `createClaudeFactory({ resolveProvider })` + `supportsClaudeConnection` | 27 |
| [`providers/{direct,bedrock,compat}.ts`](../../packages/agents/src/claude/providers/) | Adapters lazy-importam SDK real; `sdkFactory` injetável para testes | 3 × ≤ 70 |

Todos os arquivos abaixo de 400 LOC (total do claude subtree: ~925 LOC, vs 4716 em v1 — **redução de 80%**).

### Como cada requisito é cumprido

**Streaming equivalente a v1.** `event-mapper.ts` traduz cada `ClaudeStreamEvent` para zero, um, ou múltiplos `AgentEvent`. Os 10 tipos de `AgentEvent` (`started`, `text_delta`, `thinking_delta`, `tool_use_start`, `tool_use_input_delta`, `tool_use_complete`, `tool_result`, `usage`, `done`, `error`) são cobertos por testes unitários incluindo fluxo completo de tool use (4 fases: start → input_delta × N → complete com JSON parseado).

**Prompt cache TTL 1h.** `applyPromptCache1hTtl` marca apenas o **último** bloco de `system` e o **último** `tool` com `cache_control: { type: 'ephemeral', ttl: '1h' }`. Ativação é por default em `ClaudeAgent` somente quando `provider.kind === 'direct'` **e** o modelo declara `capabilities.promptCaching: true` (Opus/Sonnet/Haiku 4+, Claude 3.5). Bedrock e compat **nunca** ativam 1h automaticamente — API aceita 5m default, e Bedrock tem quirks de cache que a v1 já observou. Teste valida os dois branches.

**Bedrock SigV4 preservado.** O `BedrockProvider` recebe todo o payload pré-mapeado via `mapConfig`; o body chega pronto no `invokeWithResponseStream`, onde o SigV4 é calculado pelo AWS SDK. **Nenhum** código pós-assinatura muta o request — o bug v1 do `fetch` interceptor não pode se repetir porque não há interceptor. A integração real é encapsulada atrás de `sdkFactory` (host-provided); sem factory, a provider falha imediatamente com `AgentError.unavailable('claude-bedrock')`, sinal explícito vs crash silencioso.

**AbortSignal sempre.** `ClaudeAgent` cria um `AbortController` por sessão, substitui se já existe um ativo, e propaga `controller.signal` para `provider.createMessage`. Três caminhos cancelam: (1) `agent.dispose()`, (2) `agent.interrupt(sessionId)`, (3) `observable.unsubscribe()`. `StreamRunner` chec­a `signal.aborted` a cada iteração e emite `done:interrupted` + retorna.

**Cobertura ≥ 85%.** 45 testes só no subtree Claude cobrem todas as transformações puras a 100%. StreamRunner tem 4 testes de orquestração. ClaudeAgent tem 6 testes de ciclo de vida (incluindo dispose aborta provider pendente).

### Contrato do Provider

```ts
interface ClaudeProvider {
  readonly kind: 'direct' | 'bedrock' | 'compat';
  createMessage(
    params: ClaudeCreateMessageParams,
    context: { signal: AbortSignal },
  ): Promise<AsyncIterable<ClaudeStreamEvent>>;
}
```

É um tipo. Os três adapters implementam isso mas carregam seus SDKs **apenas quando chamados** via `await import(/* @vite-ignore */ '@anthropic-ai/sdk')`. Em CI / testes / renderer, a classe existe sem custo algum — `new DirectApiProvider({ apiKey })` não baixa nada. Apenas quando o agent roda de verdade o SDK entra.

## Consequências

### Positivas

- Cada arquivo tem uma única responsabilidade testável isoladamente. Bug em tool_use JSON incremental → abre `tool-accumulator.ts` de 57 linhas.
- Adicionar um novo provider Claude (por ex. Vertex AI) = um arquivo novo implementando `ClaudeProvider`. Sem mexer em `claude-agent.ts`, `mapper.ts`, `event-mapper.ts`.
- `fetch`-interceptor morto. Bedrock e direct usam SDKs oficiais; não há code path onde o body seja mutado após signing.
- Dispose determinístico. Testes verificam que `dispose()` aborta sinais em voo.

### Negativas / Trade-offs

- A `DirectSdkLike` / `BedrockRuntimeLike` / `CompatTransport` são shapes mínimos (structural). Se a API do `@anthropic-ai/sdk` mudar, o cast no `loadAnthropicSdk` precisa ser atualizado. Aceito: o acoplamento fica em 1 função de 15 linhas.
- `rxjs` na boundary do agent, `AsyncGenerator` dentro do runner. Conversão é trivial (`new Observable` envolve o `for await`), mas é uma camada de indireção. Alternativa (renderer assina `AsyncIterable` direto) não ganha nada e perde integração com `unsubscribe` do rxjs.
- `async function*` com `await Promise.resolve()` nos testes é boilerplate (biome `useAwait`). Aceito — três linhas extras evita disable comment.

### Neutras

- `@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime` e `@sentry/electron` ficam **fora** do `package.json` de `@g4os/agents`. Host (main process) fornece via `sdkFactory` ou via dynamic import resolvida pelo workspace-root `pnpm-lock.yaml` quando instalado.

## Validação

- **45 testes** no subtree Claude:
  - `capabilities.test.ts` (6): perfis Opus 4/Sonnet 4/Haiku 4/3.5/Opus 3 legacy/default.
  - `mapper.test.ts` (8): mapeamento de blocos, roles, tools, thinking levels, omissão de optionais.
  - `cache-markers.test.ts` (7): marker no último bloco system/tool, opt-out, last-user-turn, default TTL 5m, upgrade de marker existente.
  - `event-mapper.test.ts` (7): sentinelas vazios, text/thinking delta, ciclo completo de tool use com 4 fases, parse robusto de JSON malformado, usage + done.
  - `stream-runner.test.ts` (4): stream limpa, sem stop_reason, abort mid-stream, provider rejeitando.
  - `factory.test.ts` (3): supports prefixes, kind, `resolveProvider` chamado com config.
  - `claude-agent.test.ts` (6): capabilities via modelId, run end-to-end, dispose aborta provider, interrupt aborta turn, 1h cache ativo em direct, desabilitado em compat.
- `typecheck`, `lint`, e gate suite full green.

## Referencias

- ADR-0070 (interface IAgent), ADR-0012 (Disposable), ADR-0011 (Result), ADR-0032 (graceful shutdown).
- [Anthropic — Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- [Anthropic — Prompt Caching 1h TTL](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [AWS Bedrock — InvokeModelWithResponseStream](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithResponseStream.html)
- `STUDY/Audit/Tasks/07-agent-framework/TASK-07-02-claude-agent.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-07-02 landed).
