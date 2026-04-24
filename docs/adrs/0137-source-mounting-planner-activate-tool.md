# ADR 0137: Source mounting per-turn — SourcePlanner + activate_sources tool handler

## Metadata

- **Numero:** 0137
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-10 (source mounting, Phase 1)

## Contexto

ADR-0086 (V1) define que sources não montam todas upfront em cada turn — isso inflaria o prompt com ferramentas inúteis e aumentaria latency + token cost. O plano é classificar:

- `native_deferred`: API remotas + MCP HTTP + managed connectors — agent recebe schemas; provider nativo (Claude/OpenAI) lazy-loada por demand.
- `broker_fallback`: MCP stdio local — dormente até agent chamar `activate_sources` ou usuário pedir explícito.
- `filesystem_direct`: pastas locais — agent usa `read_file`/`list_dir` diretos, não entra no broker.

V2 precisa implementar isso em 3 pontos:

1. **Planner per-turn** — classifica o que está enabled na sessão.
2. **Prompt composition** — TurnDispatcher injeta o plan summary como system-prompt context.
3. **`activate_sources` tool** — agent pode escolher "montar" uma fonte `broker_fallback` durante o turn.

Restrições:

- Cruiser proíbe `@g4os/agents` de importar `@g4os/sources`. Tool handler em agents não pode depender de `SourcesStore`.
- Session.enabledSourceSlugs (OUTLIER-18 SourcePicker) + stickyMountedSourceSlugs (activate_sources) + rejectedSourceSlugs (intent detector OUTLIER-05) todos alimentam o planner.

## Opções consideradas

### Opção A: Hardcode tool handler em main
**Contras:** main-size pressure (210 LOC). E tool handler agnóstico de composition seria testável sem Electron.

### Opção B: Tool handler em `@g4os/agents/tools/handlers/activate-sources.ts` importando `@g4os/sources` diretamente
**Contras:** quebra `agents-interface-isolated` cruiser rule.

### Opção C: Tool handler em `@g4os/agents/tools/handlers/activate-sources.ts` com interfaces estruturais injetadas (aceita)
**Descrição:**
- Handler define 2 interfaces no próprio módulo:
  - `SourceCatalogReader { list(workspaceId): Promise<{ slug, enabled }[]> }`
  - `SessionMetadataStore { get(sessionId): Promise<SessionMountState | null>; update(id, patch: { stickyMountedSourceSlugs }): Promise<void> }`
- Main `services/tools-bootstrap.ts` escreve adapters:
  - `SourcesStore → SourceCatalogReader` (mapeia `list()` pro shape `{slug, enabled}`)
  - `SessionsRepository → SessionMetadataStore` (mapeia `get`/`update` pros campos relevantes)
- Planner fica em `@g4os/sources/planner`, TurnDispatcher (main) consome direto.

## Decisão

**Opção C.** Tool handler é boundary-friendly: depende apenas de `@g4os/kernel`. Adapters vivem no composition root (main).

Classificação final em `planTurn()`:

```
mcp-http  → native_deferred
api       → native_deferred
managed   → native_deferred   (ADR-0086 alignment — managed é HTTP-backed)
filesystem → filesystem_direct
mcp-stdio → broker_fallback  (default case)
```

SourcePlanInput aceita `sessionEnabledSlugs?: readonly string[]` — quando `undefined`, todas workspace sources enabled entram; quando `[]`, nenhuma entra (usuário desabilitou tudo pra sessão); quando populado, filtra pela interseção. Isso honra o SourcePicker da OUTLIER-18.

`formatPlanForPrompt()` omite sources com `status !== 'connected'` da lista "Available" e as lista separadamente como "Not connected (use activate_sources or ask user to authorize)". Impede o agent de referenciar fonte stale como disponível.

## Consequências

### Positivas
- Tool handler testável sem spawnar nada (mocks das interfaces).
- Main permanece composition root — SourcesStore + SessionsRepository só moram lá.
- Session-level source picker (OUTLIER-18) funciona end-to-end: `SessionsPicker` → `trpc.sessions.update({enabledSourceSlugs})` → TurnDispatcher lê → planner filtra.
- Rejeições do usuário ("don't use hubspot") viram sticky: TurnDispatcher integra `SourceIntentDetector` (de `@g4os/sources/lifecycle`) antes do planner — rejections ficam persistidas entre turns.

### Negativas / Trade-offs
- 2 adapters pequenos em `tools-bootstrap.ts` pra costurar as interfaces. Aceitável — é composition-root trabalho natural.
- `formatPlanForPrompt` omitindo stale status pode confundir usuário que acha "minha fonte sumiu do chat". Mitigação: mensagem "Not connected ... ask user to authorize" guia o agent a pedir auth.

### Neutras
- `activate_sources` Phase 1 só marca sticky — mount real de MCP stdio + managed connectors vira em FOLLOWUP-OUTLIER-12.

## Validação

- Planner classifica os 5 kinds corretamente (test pendente em FOLLOWUP-14).
- TurnDispatcher passa `session.enabledSourceSlugs` pro planner (linha ~275).
- Intent detector wire no TurnDispatcher — rejeições persistem em `session.rejectedSourceSlugs`.
- `activate_sources` registrado no catálogo junto com `list_dir`, `read_file`, `write_file`, `run_bash` (via `buildToolCatalog`).

## Referencias

- ADR-0086 (V1 source mounting classification)
- ADR-0136 (@g4os/sources subpaths)
- TASK-OUTLIER-10 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
