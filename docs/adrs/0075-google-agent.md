# ADR 0075: GoogleAgent — Gemini native routing + safe tool names + GenAI SDK

## Metadata

- **Numero:** 0075
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-04-google (epic 07-agent-framework)

## Contexto

A V1 suportava Gemini através do mesmo `pi-agent-server` que tratava OpenAI, acoplado ao `@mariozechner/pi-ai` e ao SDK antigo `@google/genai`. O Gemini possui comportamentos radicalmente diferentes do OpenAI:

1. **Native routing**: Para URLs, YouTube e pesquisa na web, o Gemini pode usar ferramentas nativas (`googleSearch`, `urlContext`, `youtube_video`) que retornam resultados mais ricos — mas essas tools são incompatíveis com o modo `custom_tools`. A escolha errada da estratégia degrada silenciosamente a qualidade da resposta.

2. **Turn classifier**: A V1 resolveu isso com uma chamada LLM assíncrona de classificação antes de cada turn — um "meta-agente" leve que decide a estratégia: `native_search`, `native_url_context`, `native_youtube` ou `custom_tools`.

3. **Restrição de nomes de ferramentas**: O Gemini aceita apenas `[A-Za-z0-9_.]`, máximo 64 caracteres. Names como `mcp__github__create_pr` são inválidos e causam erro 400 silencioso. A V1 usava `buildGeminiSafeToolName` com hash FNV-1a para garantir nomes únicos dentro do limite.

4. **Thinking config divergente**: Enquanto OpenAI usa `reasoning_effort: 'low'|'medium'|'high'`, Gemini usa `thinkingBudget` (tokens) para gemini-2.5 e `thinkingLevel: MINIMAL|LOW|MEDIUM|HIGH` para gemini-3.x.

Requisitos:
- Eliminar `@mariozechner/pi-ai` e usar `@google/genai` oficial
- Native routing preservado com fallback gracioso para `custom_tools` se o classifier falhar
- Gem safe tool names obrigatórios com mapa de reversão para tool results
- Thinking config mapeada via `@g4os/agents/shared/thinking`
- Injetabilidade do SDK para testes sem credenciais reais

## Opções consideradas

### Opção A: subprocess como Codex (processo filho)

Isolar o Gemini em um processo filho NDJSON, similar ao CodexAgent.

**Rejeitado:** `@google/genai` é HTTP puro, sem binário nativo. O overhead de subprocess não traz benefício — ao contrário do Codex CLI que requer isolamento por ser um processo com state de filesystem próprio.

### Opção B: GoogleAgent in-process com GenAI SDK lazy-loaded (escolhido)

`GoogleAgent` implementa `IAgent` diretamente. O SDK `@google/genai` é carregado via dynamic import em `GenAIProvider`. O turn classifier é uma chamada extra ao mesmo modelo antes de cada turn — custo marginal justificado pelo ganho de qualidade.

Fallback garantido: se o classifier rejeitar (timeout, erro de rede, configuração), o agente cai silenciosamente para `custom_tools` logando um `warn`. A sessão não quebra.

`enableNativeRouting: false` permite desabilitar o classifier (útil para providers compat que servem Gemini sem suporte a native tools).

### Opção C: detector determinístico por regex (sem LLM classifier)

Detectar `youtube.com`, `https://` e palavras-chave para decidir a estratégia sem chamar o LLM.

**Rejeitado:** A V1 tentou isso e produziu falsos positivos (URL em contexto de código sendo roteado para `native_url_context`). O classifier LLM tem melhor precisão e o custo extra pela chamada com `thinkingBudget: 0` é mínimo.

## Decisão

Opção B. `@g4os/agents/google` com `GenAIProvider` injetável, native routing por classifier LLM com fallback `custom_tools`, e safe tool names com mapa de reversão por sessão.

## Consequências

**Positivas:**
- Gemini native search/URL/YouTube funciona sem subprocess extra
- Nomes de tools seguros garantidos — zero erro 400 por nome inválido
- Classifier com `MINIMAL` thinking para gemini-3 (custo ~10x menor que o turn real)
- `enableNativeRouting: false` garante compatibilidade com providers compat

**Neutras:**
- `reverseToolNameCache` é um `Map` singleton por módulo — limpo entre instâncias diferentes do agente somente se o módulo for recarregado. Para uso em worker isolado isso não é problema.
- Tool results são enviados como `functionResponse` — requer que o `event-mapper` resolva o safe name de volta ao original (`resolveOriginalToolName`)

**Negativas:**
- Classifier adiciona latência de uma chamada LLM antes de cada turn (mitigada por `thinkingBudget: 0` / `MINIMAL`)
- `native_youtube` requer URL de vídeo válida no texto; se ausente, o SDK retorna erro — o runner deve ser tolerante

## Estrutura implementada

```
packages/agents/src/google/
├── google-agent.ts           # IAgent, native routing, AbortController lifecycle
├── factory.ts                # AgentFactory, supports() para google/gemini/pi_google/pi_gemini
├── capabilities.ts           # detectGeminiCapabilities() com thinking por modelId
├── types.ts                  # GeminiStreamParams, GeminiStreamChunk, GeminiProvider, GeminiTool
│                             # toGeminiSafeToolName() [A-Za-z0-9_.] max 64
├── config/mapper.ts          # messages + tools → Gemini format, safe names
├── event-mapper/
│   └── event-mapper.ts       # GeminiStreamChunk → AgentEvent, resolveOriginalToolName
├── providers/
│   └── genai-provider.ts     # @google/genai lazy-loaded + classifyTurn() LLM call
└── runner/
    └── stream-runner.ts      # estratégia → params → GeminiAsync → AgentEvents
```

## Armadilhas preservadas da V1

1. `gemini_native` turns NÃO devem receber session tools — implementado como early return em `shouldExposeSessionTool` (ADR-0073)
2. Gemini não suporta `system` role no histórico de mensagens — `systemInstruction` vai em `config`, não em `contents`
3. `finishReason` pode ser ausente em chunks intermediários — o runner aguarda explicitamente pelo chunk com `finishReason` para emitir `done`
4. Thinking parts têm `thought: true` no SDK v2 — `adaptStream` verifica `part.thought` para routing para `thinking_delta`

## Referências

- ADR-0070 (plugin architecture)
- ADR-0073 (shared broker — `shouldExposeSessionTool` com `promptMode: 'gemini_native'`)
- `TASK-07-04-google.md`
- `TASK-07-04a-analisys.md` (seções 1.2, 1.3, 4, 5)
- `gemini-native.ts` da V1 (`packages/pi-agent-server/src/gemini-native.ts`)
