# ADR 0074: OpenAIAgent — completions + responses API + prompt cache keys + tool search namespacing

## Metadata

- **Numero:** 0074
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-04-openai (epic 07-agent-framework)

## Contexto

A V1 entregava suporte a OpenAI através do `pi-agent-server` (1485 LOC em um único arquivo) acoplado ao pacote pessoal `@mariozechner/pi-ai`. Esse pacote era acessado via paths compilados internos (`node_modules/@mariozechner/pi-ai/dist/...`), tornando a instalação frágil em Windows — o caminho quebrava em ambientes sem a estrutura exata de node_modules esperada, produzindo o erro "binary not found" reportado pelos clientes.

Adicionalmente, o pi-agent-server concentrava dentro de si:
- Dois protocolos de streaming OpenAI: Chat Completions e Responses API (com mapeamentos distintos de history e tool calls)
- Lógica de OpenAI Prompt Cache Keys (fingerprint workspace + toolset)
- Reorganização de ferramentas em namespaces para modelos `gpt-5.4+` (`defer_loading` + `tool_search`)
- Abstração de `thinkingLevel` para `reasoning_effort`

Com a chegada da arquitetura de plugins (ADR-0070), faz sentido que cada provider seja um pacote independente implementando `IAgent`.

Requisitos:
- SDK oficial `openai` npm — elimina a dependência frágil do pacote pessoal
- Suporte a dois protocolos: `completions` (Chat Completions) e `responses` (Responses API)
- Suporte a providers OpenAI-compatible via `baseURL` customizado sem código adicional
- Prompt cache keys automáticas para OpenAI oficial
- Tool search namespacing para modelos `gpt-5.4+`
- Injetabilidade de provider para testes sem SDK real

## Opções consideradas

### Opção A: reutilizar o pi-agent-server como processo filho

Mantiver a arquitetura de subprocess do Codex (processo filho NDJSON) para o OpenAI também. Permite reutilizar o código V1 refatorado.

**Rejeitado:** OpenAI SDK não precisa de isolamento por processo — não há binário nativo, é HTTP puro. Adicionar um subprocess seria overhead sem benefício, e o `openai` npm funciona perfeitamente no main worker.

### Opção B: OpenAIAgent in-process com providers DI (escolhido)

`OpenAIAgent` implementa `IAgent` diretamente, sem subprocess. Os dois protocolos são encapsulados em `CompletionsProvider` e `ResponsesProvider`, ambos implementando `OpenAIProvider`. O SDK `openai` é carregado via dynamic import (`loadDefaultSdk`) — o mesmo padrão "lazy-import" da ADR-0071.

`OpenAIFactory.supports()` detecta slugs `openai*`, `pi_openai*`, `openai-compat*`, cobrindo todos os casos V1 sem código adicional.

### Opção C: agente genérico OpenAI-compat para todas as chamadas REST

Um único agente que aceita qualquer provider REST compatível com o formato OpenAI. Mais simples no início.

**Rejeitado:** Prompt cache keys e tool search namespacing são comportamentos exclusivos da OpenAI oficial e quebram em providers compat. Misturá-los em um agente genérico exigiria runtime checks desnecessários. Melhor separar lógica no `factory` via `baseURL` sentinel.

## Decisão

Opção B. `@g4os/agents/openai` com `CompletionsProvider` + `ResponsesProvider` injetáveis, `buildPromptCacheKey` via fingerprint, e `buildOpenAIHostedToolSearchTools` para modelos suportados. OpenAI-compat é suportado pelo mesmo agente via `baseURL` — a factory detecta que não é URL oficial e suprime prompt cache + tool search automaticamente.

## Consequências

**Positivas:**
- Elimina `@mariozechner/pi-ai` e o risco de "binary not found"
- Protocolo `responses` disponível sem subprocess adicional
- Prompt cache key por (workspaceId + connectionSlug + toolNames hash) garante cache hit mesmo com mudança de ferramenta
- Tool search namespaces (`defer_loading`) reduzem latência para modelos `gpt-5.4+` com muitas tools

**Neutras:**
- `CompletionsProvider` e `ResponsesProvider` compartilham `OpenAIStreamChunk` unificado — normalização ocorre no `translateRawChunk`/`processResponsesStream`
- `ToolAccumulator` replicado do ClaudeAgent (mesmo padrão, código independente — sem acoplamento cross-agent)

**Negativas:**
- Dois providers para manter em vez de um — justificado pela diferença real de shape das APIs

## Estrutura implementada

```
packages/agents/src/openai/
├── openai-agent.ts           # IAgent, AbortController lifecycle
├── factory.ts                # AgentFactory, supports() por slug prefix
├── capabilities.ts           # detectCapabilities() por modelId
├── types.ts                  # OpenAIStreamParams, OpenAIStreamChunk, OpenAIProvider
├── config/mapper.ts          # messages + tools → OpenAI format
├── cache/prompt-cache-keys.ts # fingerprint hash
├── tool-search/namespace-builder.ts  # defer_loading para gpt-5.4+
├── providers/
│   ├── completions.ts        # Chat Completions streaming
│   └── responses.ts          # Responses API streaming
├── runner/
│   ├── stream-runner.ts      # async generator de AgentEvents
│   └── tool-accumulator.ts   # acumula tool calls fragmentadas
└── event-mapper/event-mapper.ts  # chunks → AgentEvents
```

## Armadilhas preservadas da V1

1. `pi-agent-server` acessava internals do SDK via path relativo — v2 usa dynamic import pelo nome do pacote (`import('openai')`)
2. Histórico de mensagens com tool calls fragmentados entre chunks — `ToolAccumulator.appendDelta` preserva o mesmo comportamento
3. `reasoning`/`reasoning_content`/`reasoning_text` são nomes diferentes usados por providers compat — `CompletionsProvider` verifica todos os três

## Referências

- ADR-0070 (plugin architecture)
- ADR-0073 (shared broker)
- `TASK-07-04-openai.md`
- `TASK-07-04a-analisys.md` (seções 1.2, 1.3, 3)
