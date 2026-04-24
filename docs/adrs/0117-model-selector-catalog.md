# ADR 0117: Model selector + catalog com capabilities tipadas

## Metadata

- **Numero:** 0117
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Selecionar modelo no chat da v1 era uma string livre com autocomplete — `"claude-3-5-sonnet-20241022"` digitada à mão, sem validação. Consequências:

- Modelo deprecado aparecia na UI porque ninguém tinha lista canônica.
- Context window do modelo não era mostrado em lugar algum — usuário só descobria que estourou quando o provider retornava 400.
- Thinking level (OpenAI `reasoning_effort` / Anthropic `budget_tokens` / Google `thinkingBudget`) era configurado num JSON separado sem conexão com o modelo escolhido; combinações inválidas ("GPT-4o + extended thinking") viravam erro opaco.

TASK-11-00-07 pede um catálogo tipado que funcione como fonte única de verdade para selector, thinking UI e validação no backend.

## Opções consideradas

### Opção A: Pull dinâmico das APIs dos providers

**Descrição:** no boot, bater em `/v1/models` de cada provider e montar catálogo em runtime.

**Pros:**
- Sempre atualizado.

**Contras:**
- Requer auth para chamar — modelo selector fica indisponível até usuário logar em todos os providers.
- Capabilities (thinking, vision, tools) não são expostas uniformemente em `/v1/models`.
- Latência no boot + ponto de falha externo.

### Opção B: Catálogo estático versionado em `@g4os/features/chat/model-catalog`

**Descrição:** constante `MODELS: readonly ModelSpec[]` com todos os modelos suportados. `ModelSpec` tem `id`, `provider`, `contextWindow`, `capabilities`, `thinkingLevels`.

**Pros:**
- Zero latência no boot.
- Fonte única — selector, thinking UI e validação backend consultam o mesmo array.
- PR de upgrade (novo modelo) é reviewable — audit trail fica no git.

**Contras:**
- Precisa manter manualmente. Aceitável — providers lançam modelos em cadência de semanas, não de horas.

### Opção C: Híbrido — catálogo estático + override dinâmico

**Descrição:** Opção B como base + fetch remoto opcional para auditoria.

**Pros:**
- Flexível.

**Contras:**
- Duas fontes de verdade = divergência garantida. Rejeitado pela regra "fonte única ou nada".

## Decisão

Optamos pela **Opção B** (catálogo estático versionado).

### Shape do `ModelSpec`

```ts
interface ModelSpec {
  readonly id: string;              // "claude-opus-4-7"
  readonly provider: ModelProvider; // "anthropic" | "openai" | "google" | "openai-compat" | "bedrock-claude"
  readonly displayName: string;     // "Claude Opus 4.7"
  readonly contextWindow: number;   // tokens
  readonly supportsVision: boolean;
  readonly supportsTools: boolean;
  readonly supportsPromptCache: boolean;
  readonly thinkingLevels: readonly ThinkingLevel[];  // ['none', 'low', 'medium', 'high']
}

type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';
```

`thinkingLevels` é array — se um modelo não suporta thinking, é `['none']`. O `ThinkingLevelSelector` só aparece quando `thinkingLevels.length > 1`.

### `findModel(id)` como lookup central

```ts
function findModel(id: string): ModelSpec | undefined;
```

Consumido por: `ModelSelector` (UI), `ThinkingLevelSelector` (filtra níveis válidos), agent factory (valida antes de spawnar).

### `formatContextWindow(n)` i18n-safe

Retorna `"200K"`, `"1M"` etc. — formatação consistente entre selector dropdown e indicador inline.

## Consequências

### Positivas

- Combinações inválidas são impossíveis: `ThinkingLevelSelector` só mostra níveis que o modelo suporta.
- Context window visível no dropdown (ex: "Claude Opus 4.7 — 200K tokens") antecipa problema de overflow.
- Upgrade de modelo = um PR tocando `model-catalog.ts` + changeset. Reviewable, testável.
- Catálogo é transport-agnostic — funciona no viewer web futuro sem adaptação.

### Negativas / Trade-offs

- Novos modelos exigem PR manual (latency: horas, não segundos). Aceitável — ADR-0070/0071/0074/0075 já estruturam factories de agent, que validam o modelo antes de criar instância; adicionar modelo novo é 1-2 arquivos.
- Catálogo pode ficar desatualizado; mitigação é a cadência de review semanal do epic-7 agents.

### Neutras

- `ModelProvider` union é canônica para o chat; backend usa o mesmo tipo via `@g4os/features/chat`.
- Search no selector (`chat.modelSelector.searchPlaceholder`) usa `cmdk` (já consolidado no @g4os/ui).

## Estrutura implementada

```
packages/features/src/chat/
├── model-catalog.ts              # MODELS + findModel + formatContextWindow + types
├── components/
│   ├── model-selector.tsx        # cmdk + provider badges + context window
│   └── thinking-level.tsx        # segmented control
```

i18n: `chat.modelSelector.ariaLabel`, `chat.modelSelector.placeholder`, `chat.modelSelector.searchPlaceholder`, `chat.thinkingLevel.ariaLabel`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤200 LOC.
- Gate `check:i18n`: zero strings hardcoded.
- TypeScript: `ThinkingLevel` union pega combinações inválidas em compile time.

## Referências

- TASK-11-00-07
- ADR-0070 (IAgent interface + AgentFactory consome ModelSpec)
- ADR-0071 (ClaudeAgent — prompt cache só para modelos com `supportsPromptCache: true`)
- ADR-0073 (agents shared — `resolveThinkingConfig` mapeia ThinkingLevel → provider-specific config)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-07 entregue).
