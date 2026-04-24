# ADR 0070: Agent plugin architecture (IAgent interface + registry com Result)

## Metadata

- **Numero:** 0070
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-01 (epic 07-agent-framework)

## Contexto

Em v1, a orquestração dos três agentes (Claude, Codex, Pi) vivia em [`apps/electron/src/main/sessions.ts`](../../../G4OS/apps/electron/src/main/sessions.ts) — o God File que conhecia cada provider pelo nome, propagava configurações específicas por `if (provider === 'claude') { ... }` e misturava streaming, retries e tools em um só módulo. Adicionar um novo agente significava alterar ~10 arquivos em sessões/IPC/UI e reabrir testes já verdes.

Objetivos v2:

1. `SessionManager` não pode mais conhecer implementações concretas de agentes.
2. Adicionar um provider deve ser: _criar um pacote, exportar um `AgentFactory`, registrar._ Nenhum arquivo existente deve mudar.
3. O contrato de streaming precisa cobrir todos os eventos que a v1 emitia (`text_delta`, `thinking_delta`, tool use em 4 fases, usage, done, error) sem casos de `string | unknown` disfarçados.
4. Erros de resolução de agente são **esperados** — o usuário pode selecionar uma conexão que nenhum backend registrado suporta. Devem ser `Result`, não throw.

## Opções consideradas

### Opção A: interfaces inline em `packages/features/chat`
**Pros:** menos pacotes.
**Contras:** features dependeriam transitivamente da implementação Anthropic/OpenAI; a boundary que existe (`cross-feature-imports` bloqueado em `.dependency-cruiser.cjs`) obrigaria cada feature a reimplementar o contrato.

### Opção B: `IAgent` em `@g4os/kernel`
**Pros:** sem novo pacote.
**Contras:** kernel depende apenas de Zod/pino/neverthrow — puxar `rxjs` para o núcleo contamina todos os pacotes. Kernel deve permanecer isolado (ADR-0006, regra `kernel-is-foundation`).

### Opção C: `@g4os/agents/interface` como contrato público; implementações como pacotes irmãos (aceita)
**Descrição:**
- Pacote `@g4os/agents` expõe dois subpaths: `.` (barrel re-exportando interface) e `./interface` (contrato estável).
- Implementações serão pacotes separados (`@g4os/agent-claude`, `@g4os/agent-codex`, `@g4os/agent-pi` — TASK-07-02..04) que só dependem de `@g4os/agents/interface` + `@g4os/kernel`.
- `AgentRegistry` é a ponte: factories auto-registram em bootstrap; `SessionManager` recebe um `AgentRegistry` no construtor e apenas chama `registry.create(config)`.

## Decisão

**Opção C.** Implementação em [`packages/agents/src/interface/`](../../packages/agents/src/interface/):

- [`agent.ts`](../../packages/agents/src/interface/agent.ts) — tipos imutáveis (`readonly` em toda field), uniões discriminadas (`AgentEvent`), `IAgent extends IDisposable` (ADR-0012 — garante cleanup de subscription/AbortController), `AgentFactory` com `supports(config)` + `create(config)`.
- [`registry.ts`](../../packages/agents/src/interface/registry.ts) — `AgentRegistry.register(factory)` **lança** (erro de programador em boot); `resolve`/`create` retornam `Result<IAgent, AgentError>` via `neverthrow` (ADR-0011) mapeando `AGENT_UNAVAILABLE` quando nenhuma factory suporta o slug. Exporta também `has`, `get`, `list`, `unregister`, `clear` para wiring e testes.
- [`schemas.ts`](../../packages/agents/src/interface/schemas.ts) — schemas Zod para `AgentConfig`, `AgentCapabilities`, `AgentDoneReason`, `ThinkingLevel`, `AgentFamily`. Validação runtime de payloads IPC (TASK-02 / ADR-0020 tRPC) quando o backend da sessão serializar `AgentConfig`.
- `ToolDefinition` vem de `@g4os/kernel` (não é redefinido por agentes) — consistência com o que `SessionManager` e `mcp/sources` já usam.

## Consequências

### Positivas
- `SessionManager` perde todo o `switch (provider)` — vira um chamador do registry.
- Pacote novo = arquivo novo. Cruiser garante que features não importem implementações (`no-cross-feature-imports`) e que pacotes de agente concretos só importem `interface`.
- Erros de resolução são Result — o handler IPC mapeia para `typed_error` e o renderer mostra CTA "selecione outro provider" sem try/catch.
- Capabilities ficam no contrato — UI pode desabilitar "thinking" em providers sem suporte antes de enviar a request.

### Negativas / Trade-offs
- `register()` throwing é inconsistente com a filosofia "Result para tudo esperado". Aceito: duplicate kind é erro de bootstrap, equivale a digitar o id errado em um `Map<string, T>`; fail-fast ajuda mais do que Result aqui.
- `rxjs` entra como dep runtime do contrato. Alternativa (callbacks ou AsyncIterable) adicionaria plumbing próprio para cancelamento/backpressure — rxjs resolve sem novo código. Renderer consome via IPC, não importa rxjs.

### Neutras
- `globalAgentRegistry` é singleton exportado; testes criam instâncias locais de `AgentRegistry` com `new`, sem tocar o singleton.

## Validação

- 7 testes (`registry.test.ts`): register/list, duplicate rejection, resolve, create com Result, Result chain idiomática (`.map` / `.mapErr` / `.orElse`), unregister, clear.
- 6 testes (`events.test.ts`): switch exaustivo sobre `AgentEvent` (falha de compilação se alguém adicionar evento sem atualizar consumers), schemas parse/reject.
- `dependency-cruiser` rule `agents-interface-isolated` garante que `packages/agents` só depende de `@g4os/kernel`.

## Referencias

- ADR-0006 (boundaries), ADR-0011 (Result), ADR-0012 (Disposable), ADR-0020 (tRPC IPC).
- [rxjs Observable contract](https://rxjs.dev/guide/observable)
- `STUDY/Audit/Tasks/07-agent-framework/TASK-07-01-agent-interface.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-07-01 landed).
