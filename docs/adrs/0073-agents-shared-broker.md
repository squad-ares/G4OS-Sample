# ADR 0073: @g4os/agents/shared — proxy broker + thinking resolver

## Metadata

- **Numero:** 0073
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-04 (epic 07-agent-framework)

## Contexto

Auditoria do `PiAgent` da v1 (2133 LOC em um arquivo só) revelou que ~600 LOC são dedicadas ao **proxy broker layer**: a camada que faz a ponte entre o agente e os session tools, MCP sources, permissões e detecção de ativação de sources. Essa lógica é naturalmente compartilhada entre qualquer backend que não seja Claude nativo — OpenAI custom-tools e Gemini custom-tools em particular.

Sem extrair esse broker como módulo shared, OpenAIAgent e GoogleAgent duplicariam 600 LOC de lógica quase idêntica, exatamente a armadilha que o TASK-07-04a-analisys.md alerta.

Requisitos:

- DI por padrão: todo consumidor externo é interface, testes injetam fakes.
- Zero dependência em `electron`/`main/` — broker é puramente de lógica.
- Thinking level abstraído para todos os três providers (OpenAI/Google/Anthropic).
- Exports estáveis via `@g4os/agents/shared` para consumo pelos agentes.

## Opções consideradas

### Opção A: cada agent replica broker internamente

Cada package (`openai`, `google`) importaria `@modelcontextprotocol/sdk` direto e implementaria filtragem de session tools, permissões, detecção de source activation. Simples de começar, mas é exatamente o padrão que produziu o monolito v1.

### Opção B: broker centralizado em `@g4os/agents/shared` (escolhido)

Cinco módulos focados, cada um com contrato DI:

- `broker/mcp-pool.ts` — `McpPoolClient` interface (listTools/callTool/closeAll)
- `broker/session-tools.ts` — `SessionToolProfile` + `filterSessionTools` + `shouldExposeSessionTool`
- `broker/permission-handler.ts` — `PermissionHandler` interface + `AlwaysAllow/Deny/Ask` handlers
- `broker/source-activation.ts` — `detectSourceAccessIssue` + `detectBrokeredSourceActivation`
- `thinking/level-resolver.ts` — `resolveThinkingConfig` mapeia ThinkingLevel para reasoning_effort (OpenAI) / thinkingBudget (Google) / budgetTokens (Anthropic)

Nenhum desses módulos instancia conexões; todos declaram contratos que os agentes satisfazem com adaptadores reais. Isso permite testar ~100% do broker sem tocar em `@modelcontextprotocol/sdk`.

## Decisão

Opção B. Broker e thinking-resolver vivem em `@g4os/agents/shared` com subpath export, consumíveis por qualquer agent package.

## Consequências

**Positivas:**
- OpenAIAgent e GoogleAgent passam a compartilhar ~600 LOC em vez de duplicar.
- Regressão V1: `gemini_native` turns não recebem session tools, garantido aqui via `promptMode` check central.
- Thinking config mudanças (novos modelos) ficam num único arquivo.

**Neutras:**
- `McpPoolClient` sem implementação default — agente que precisa chama `@modelcontextprotocol/sdk` diretamente e injeta o adapter. Implementação compartilhada fica para TASK-08 (sources) quando o wiring MCP real existir.

**Negativas:**
- Mais um subpath export no `package.json` do `@g4os/agents` (tolerável; já temos claude/codex/interface).

## Armadilhas preservadas da v1

1. `filterAndOrderSessionTools` v1 checa `promptMode !== 'gemini_native'` para todos os session tools — v2 implementa isso no topo de `shouldExposeSessionTool` (early return false).
2. `getSessionToolPriority` v1 ordena tools numericamente — v2 preserva via campo `priority` + tiebreaker alfabético estável.
3. `handlePermissionRequest` v1 checa preload whitelist antes do prompt — v2 expõe via `AskHandlerHooks.isWhitelisted`.

## Referências

- `STUDY/Audit/Tasks/07-agent-framework/TASK-07-04-broker.md`
- `STUDY/Audit/Tasks/07-agent-framework/TASK-07-04a-analisys.md` (secção 1.5)
- ADR-0070, ADR-0071, ADR-0072
