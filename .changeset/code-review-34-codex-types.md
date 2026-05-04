---
'@g4os/codex-types': patch
---

Code Review 34 — packages/codex-types — 11 findings (1 CRITICAL, 3 HIGH, 4 MEDIUM, 3 LOW).

Pacote `@g4os/codex-types` é um arquivo único `src/index.ts` (184 LOC) que pretende tipar o "wire format NDJSON do Codex CLI app-server" (ADR-0072). A revisão exaustiva expôs que **o pacote não tipifica o protocolo real** — é um contrato sintético inventado pela V2, nunca wired no app, e que diverge ponto-a-ponto da spec emitida pelo binário Codex CLI (V1 mantinha 222 arquivos auto-gerados via `codex app-server generate-ts`). Ademais ainda restam menores issues de drift de catalog, exports e narrowing.

---

### F-CR34-1 — Schema `CodexResponseEvent` / `CodexRunTurnRequest` não corresponde ao protocolo real do Codex CLI (CRITICAL)

- **Severidade:** CRITICAL
- **Path:** `packages/codex-types/src/index.ts:25-146`
- **ADR:** ADR-0072 (Codex agent subprocess) declara como objetivo "Subprocess starts + responds com NDJSON estável (roundtrip testado)" — testes do `@g4os/agents/codex` rodam contra `FakeSpawner` synthetics, não o binário real.
- **Root cause:** O protocolo declarado aqui (`{ type, requestId, input }` para requests; `{ type: 'text_delta'/'turn_started'/'usage'/'turn_finished', ... }` para responses) é uma invenção V2. O Codex CLI real usa **JSON-RPC** com envelope `{ method, id, params }` e emite eventos como `agent_message_delta`, `task_started`, `task_complete`, `token_count`, `mcp_tool_call_begin`, `exec_command_begin`, `apply_patch_approval_request`, etc. (ver V1 `G4OS/packages/codex-types/src/EventMsg.ts` linha 70 — 60+ event types vs. 10 declarados aqui). Campos numéricos também divergem: nosso `usage.inputTokens/outputTokens` (camelCase) vs. real `input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens` (snake_case). Métodos como `thread/start`, `turn/start`, `turn/interrupt`, `account/login/start` simplesmente não existem em `CodexRequest`. **Consequência:** se alguém wirar `createCodexFactory()` no `agents-bootstrap.ts` apontando pro binário Codex de fato, todo turn falha em decode (`schema_error` no `frame.ts`) e `CodexAgent` nunca emite uma `AgentEvent` válida — exatamente o "drift silencioso" que F-CT1 prometia evitar.
- **Fix sugerido:** **Reverter para o pipeline de geração** que V1 usava (`codex app-server generate-ts --out src` no script `regenerate`), pinando uma versão do binário no `catalog`/devDependency e versionando os 220+ arquivos gerados; `protocol.ts` em `agents/codex/app-server/` consome as uniões reais (`ClientRequest`, `EventMsg`) e o mapper traduz para `AgentEvent`. Alternativa pragmática (se descontinuar Codex no MVP é a decisão real, o que parece ser o caso pelo `agents-bootstrap.ts` não registrar codex factory): marcar `@g4os/codex-types` + `@g4os/agents/codex` como `private: true` + `// @internal-skeleton` + ADR explícito declarando que CodexAgent é placeholder com protocolo sintético, NÃO V1 parity. O texto atual ("types compartilhados do protocolo NDJSON do Codex CLI", "Migrado da V1") é falso e induz code reviewers/integradores a confiar num contrato que nunca rodou contra o binário real.

### F-CR34-2 — Export inconsistente: 1 const exportado quebra `tsup --dts` semantics + dist desnecessário (HIGH)

- **Severidade:** HIGH
- **Path:** `packages/codex-types/package.json:8-18` (`files`/`main`/`exports`), `packages/codex-types/src/index.ts:93,165` (consts)
- **ADR:** ADR-0153 (catalog) — o package usa `vitest: catalog:` corretamente; problema é estrutural ao `exports` map.
- **Root cause:** Header diz "Pacote 100% type-only — não tem runtime, não tem deps. Build empty (tsup gera só `.d.ts`)." MAS `index.ts` exporta **dois valores runtime**: `CODEX_PROTOCOL_VERSION` (linha 93) e `CODEX_RESPONSE_EVENT_TYPES` (linha 165). `tsup` gera `dist/index.js`/`index.cjs` reais com ~30 LOC e maps. Já o `package.json` aponta `main`/`types`/`exports` para `./src/index.ts` (não para `dist/`). Resultados conflitantes:
  1. `files: ["src", "dist"]` faz publishing carregar `dist/`, mas `exports` resolve consumers para `src/index.ts` — `dist/` é dead weight (descobre via `cr-18-hardening` que tentou mexer disso e falhou em consolidar).
  2. ADR-0072 cita `CODEX_RESPONSE_EVENT_TYPES` como gate runtime usado em `frame.ts` — confirma que pacote NÃO é type-only. Comentário enganoso.
  3. `exports` declara só `import` mas não `require`; consumer CJS não tem fallback (improvável no monorepo, mas attw rejeitaria se publicado).
- **Fix:** corrigir descrição do header ("type definitions + 2 const literals usadas como gate runtime"); decidir um modelo: **(a)** package source-only via `exports: { ".": "./src/index.ts" }` + remover `tsup`/`dist/` do `files` + remover `build` script (consistência com pacotes scaffolding já `private: true`), **OU (b)** publicar com `dist/` como source of truth (`main: ./dist/index.js`, `types: ./dist/index.d.ts`, exports por `import`/`require`/`types`). Hoje está num meio-termo que deixa `dist/` órfão e `tsup.config.ts` não-usado.

### F-CR34-3 — `CodexHandshakeRequest` é dead code declarado como surface de roadmap (HIGH)

- **Severidade:** HIGH
- **Path:** `packages/codex-types/src/index.ts:81-86`, `packages/codex-types/src/index.ts:95`
- **ADR:** ADR-0072 não menciona handshake; comentário do CR-18 F-CT3 diz "AppServerClient ainda não emite (sem versionamento de protocol em uso)... quando handshake for wired, definir constante exportada `PROTOCOL_VERSION = 1` aqui".
- **Root cause:** Tipo está na união `CodexRequest = ... | CodexHandshakeRequest`, então **todo `decodeFrame`/`encode` precisa lidar com ele**, mas nenhum consumer envia/recebe handshake. Pior: `CODEX_PROTOCOL_VERSION = 1` (linha 93) é exportado mas **nunca importado** em lugar algum (grep `@g4os/codex-types` nos consumers — frame.ts importa só `CODEX_RESPONSE_EVENT_TYPES`). Surface de roadmap em pacote types-only é cargo-cult — o tipo só vale algo quando o sender/receiver o usa.
- **Fix:** remover `CodexHandshakeRequest`, remover da união `CodexRequest`, remover `CODEX_PROTOCOL_VERSION`. Adicionar quando o handshake for wired de fato (comentário pode ficar como ADR-0072 update se relevante). YAGNI elimina drift latente (alguém mexe nos campos sem checar caller, consumers descobrem em runtime).

### F-CR34-4 — `Readonly<Record<string, unknown>>` em `inputSchema`/`tool_use_complete.input` perde shape do JSON Schema (HIGH)

- **Severidade:** HIGH
- **Path:** `packages/codex-types/src/index.ts:60` (`CodexWireTool.inputSchema`), `packages/codex-types/src/index.ts:126` (`tool_use_complete.input`)
- **ADR:** ADR-0002 (TS strict) seção "Zero `any`. `unknown` + narrowing é o caminho." — `Record<string, unknown>` não é `any`, mas é tão fraco que vira escape hatch silencioso.
- **Root cause:** V1 `Tool.ts` (gerado) usa `inputSchema: ToolInputSchema` — type concreto com fields tipados (`type: 'object'`, `properties: Record<...>`, `required: string[]`). Aqui `Readonly<Record<string, unknown>>` aceita `{}`, `{ foo: { bar: { baz: 1 } } }` e literalmente qualquer objeto. Consumer (`input-mapper.ts:78` passa `tool.inputSchema` direto) não tem garantia compile-time de que o que vai pro wire é JSON Schema válido. Mesmo problema em `tool_use_complete.input` (linha 126): consumer recebe `unknown` mas API impõe que é o input do tool — sem narrowing, sem zod parse, fica fé.
- **Fix:** importar `JSONSchema7` de `@types/json-schema` (devDep, zero runtime) ou definir um sub-schema `CodexJsonSchema = { type: 'object'; properties?: Record<string, unknown>; required?: readonly string[] }` aqui mesmo. Para `tool_use_complete.input`, ou tipar como `unknown` puro (força narrowing nos consumers — pattern correto no repo) ou aceitar que aqui é fronteira de validação e marcar com JSDoc explicando a semantic. `Readonly<Record<string, unknown>>` é o pior dos dois mundos.

### F-CR34-5 — Casing inconsistente entre `tool_use` (camelCase `toolUseId`) e `tool_use` (camelCase `id`/`name`) — bug latente (MEDIUM)

- **Severidade:** MEDIUM
- **Path:** `packages/codex-types/src/index.ts:42-55`
- **ADR:** N/A — convenção do próprio pacote.
- **Root cause:** `CodexWireContentBlock` define `tool_use` com `id` + `name` (linhas 46-48), mas `tool_result` usa `toolUseId` (linha 53). `CodexResponseEvent` em `tool_use_start`/`tool_use_input_delta`/`tool_use_complete` usa `toolUseId` consistentemente. Resultado: `id` em `tool_use` block (input) é o mesmo conceito que `toolUseId` em `tool_use_complete` (response), mas com nomes diferentes — leitor presume são fields distintos. Em `input-mapper.ts:28-30` o mapper renomeia `block.toolUseId` → `id` reforçando o desalinhamento. Se algum consumer trocar contexto (request vs. response) sem prestar atenção, vira bug silencioso (campo undefined cai em `id`, nada quebra compile-time porque ambos são `string`).
- **Fix:** padronizar em `toolUseId` em todos os contextos (renomear `id` → `toolUseId` em `CodexWireContentBlock`/`tool_use`). Compatibilidade com Codex CLI real é não-issue porque o protocolo já não bate (F-CR34-1). Se necessário, manter o `name` mas renomear `id` para evitar shadowing semântico.

### F-CR34-6 — `tools` no `CodexRunTurnInput` é `readonly CodexWireTool[]` mas `CodexAgentOptions`/handshake permitem rota alternativa só pra session-tools (MEDIUM)

- **Severidade:** MEDIUM
- **Path:** `packages/codex-types/src/index.ts:29` (`tools?: readonly CodexWireTool[]`)
- **ADR:** ADR-0073 (shared broker) especifica `shouldExposeSessionTool` central — Codex deveria filtrar como qualquer agent.
- **Root cause:** Real Codex CLI **não recebe `tools` no `turn/start`** — tools vêm do bridge MCP server externo (ADR-0072 menciona `bridgeMcpUrl` no handshake imaginário). Aqui `tools` é declarado como first-class no `CodexRunTurnInput`, alimentado pelo `input-mapper.ts:72-79` (`mapTools`). Consumer assume que mandando `tools` no input o Codex usa — mas o real Codex ignoraria/rejeitaria essa key. Mais um sintoma de F-CR34-1 (schema sintético), mas pontuado aqui porque é fácil corrigir indep. (remover `tools` do `CodexRunTurnInput`).
- **Fix:** ou remover `tools` do `CodexRunTurnInput` (consistente com ADR-0072 dizendo que tools chegam por bridge MCP) ou documentar JSDoc que esse field é V2-synthetic e não chega ao Codex CLI real. Junto com F-CR34-3, encolhe a surface declarada.

### F-CR34-7 — Falta cruiser rule `codex-types-isolated` análogo a `agents-interface-isolated`/`auth-isolated`/`permissions-isolated` (MEDIUM)

- **Severidade:** MEDIUM
- **Path:** `packages/codex-types/package.json` (sem deps), `.dependency-cruiser.cjs` (regra ausente)
- **ADR:** ADR-0072 sec. "Boundary preservada" + padrão repetido de `agents-interface-isolated`/`auth-isolated`/`permissions-isolated`.
- **Root cause:** Pacote é declarado type-only e atualmente não tem deps (só `vitest` em devDependencies), mas não há cruiser rule fixando isso. Qualquer PR pode adicionar `import { something } from '@g4os/kernel'` aqui e o gate não pega. Outros packages "isolated" do repo têm rules dedicadas; codex-types não.
- **Fix:** adicionar em `.dependency-cruiser.cjs`:
  ```js
  {
    name: 'codex-types-isolated',
    comment: '@g4os/codex-types is types-only; cannot depend on any internal package.',
    severity: 'error',
    from: { path: '^packages/codex-types/src/' },
    to: { path: '^packages/' },
  }
  ```

### F-CR34-8 — `CodexFrameEncoder`/`CodexFrameDecoder` interfaces no types package quando implementação está em consumer (LOW)

- **Severidade:** LOW
- **Path:** `packages/codex-types/src/index.ts:178-184`
- **ADR:** N/A.
- **Root cause:** As interfaces `CodexFrameEncoder { encode(message): string }` / `CodexFrameDecoder { decode(line): CodexResponseEvent | undefined }` só existem para serem implementadas por `jsonLineEncoder`/`jsonLineDecoder` em `agents/codex/app-server/frame.ts`. **Nenhum consumer importa essas interfaces para programar contra elas** (`grep CodexFrameEncoder` retorna só a definição + a impl). Numa types-only-package, expor uma interface sem caller que dependa do contrato é overhead — quem mantém frame.ts pode mudar a impl sem checar a interface (TS estrutural casa qualquer assinatura compatível).
- **Fix:** mover ambas para `agents/codex/app-server/frame.ts` (módulo onde vivem as impls). Reduz surface do types package e elimina pseudo-DI sem caller.

### F-CR34-9 — `CodexWireMessage.role` exclui `'system'` mas Codex CLI real aceita (LOW)

- **Severidade:** LOW
- **Path:** `packages/codex-types/src/index.ts:38`
- **ADR:** N/A — derivado do contrato real.
- **Root cause:** `role: 'user' | 'assistant' | 'tool'` (sem `'system'`). `input-mapper.ts:51-53` filtra `system` mensagens silenciosamente (`mapRole` retorna `undefined` pra qualquer role fora dos 3). System prompts são roteados pelo `instructions` field separado (linha 26), o que é correto, mas dados de mensagens existentes com `role: 'system'` vão sumir no mapper sem warning. Integra com F-CR34-1: real Codex tem `Role.ts` próprio.
- **Fix:** documentar via JSDoc no `role` que system messages são intencionalmente filtradas; adicionar `log.debug({ role })` em `mapRole` no consumer quando filtrar (dev-experience), ou padronizar `role` para incluir `'system'` e fazer explicit drop no mapper. Pequeno mas recorrente em onboarding.

### F-CR34-10 — `package.json#description` desatualizada vs. realidade (LOW)

- **Severidade:** LOW
- **Path:** `packages/codex-types/package.json:4`
- **ADR:** ADR-0072.
- **Root cause:** Description: `"Shared types for Codex CLI app-server protocol (NDJSON wire format)"`. Como F-CR34-1 documenta, **não são** os types do Codex CLI — são types sintéticos V2. Description engana code reviewer/integrador que vai assumir paridade V1.
- **Fix:** alinhar description com a realidade — ex.: `"Synthetic types for V2 Codex agent NDJSON wire format (placeholder; not a 1:1 mirror of Codex CLI app-server protocol)"`. Junto com F-CR34-1 e header de `index.ts`, a fonte de verdade descrita fica honesta.

### F-CR34-11 — `engines.node: ">=24.0.0"` em pacote sem código que dependa de Node 24 (LOW)

- **Severidade:** LOW
- **Path:** `packages/codex-types/package.json:32-34`
- **ADR:** ADR-0040a (`node:sqlite`/Node 24 piso) — justifica engine no kernel/data, não em types-only.
- **Root cause:** Pacote é só types + 2 consts string-literal. Nada em `index.ts` requer Node 24 (não usa `node:sqlite`, `node:test`, AsyncDisposable, etc.). `engines.node` aqui ou é cosmético (todos packages têm) ou é cargo-cult. No primeiro caso é consistente com o monorepo e tudo bem; no segundo, deveria ser reduzido para `>=18` se algum dia for publicado isolado. **Nota baixa-prioridade**: confirmar que é decisão consistente cross-repo (verificar `kernel/package.json`, etc.) antes de mexer; se for tudo `>=24`, fica como housekeeping.
- **Fix:** documentar em ADR-0040a (ou similar) que `engines.node: ">=24.0.0"` é o piso uniforme do monorepo independente de necessidade técnica do package, OU relaxar para o piso real do código (types-only = `>=18`). Decisão é cross-package, não específica de codex-types.

---

**Recomendação consolidada:** F-CR34-1 é estrutural — resolver dispara cascata em F-CR34-3, F-CR34-4, F-CR34-5, F-CR34-6, F-CR34-9 (todos sintomas do schema sintético). Caminho A (regenerar via `codex app-server generate-ts`) restaura paridade V1 e ADR-0072 cumpre seu objetivo declarado. Caminho B (assumir CodexAgent como skeleton placeholder) demanda ADR explícito + linguagem honesta no header/description/changesets passados. **Não fazer nada continua sendo a opção de maior risco**: bootstrap futuro tentando wirar `createCodexFactory` no `agents-bootstrap.ts` (após `Phase 4` mencionada no comentário) vai descobrir o drift em campo, exatamente o cenário que ADR-0072 prometeu evitar.
