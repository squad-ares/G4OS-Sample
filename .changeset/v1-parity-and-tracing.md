---
'@g4os/agents': patch
'@g4os/auth': patch
'@g4os/codex-types': patch
'@g4os/credentials': patch
'@g4os/data': patch
'@g4os/desktop': patch
'@g4os/desktop-e2e': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/migration': patch
'@g4os/observability': patch
'@g4os/permissions': patch
'@g4os/platform': patch
'@g4os/session-runtime': patch
'@g4os/sources': patch
'@g4os/translate': patch
'@g4os/ui': patch
'@g4os/viewer': patch
---

4 entregas em sequência: V1 parity (shortcuts, mermaid, codex-types) + tracing.

**TASK-18-09 — Global shortcuts**:
- `apps/desktop/src/main/global-shortcuts.ts` registra `Cmd+Shift+N` (new turn → emite IPC pra renderer focar composer + show janela se hidden) e `Cmd+Shift+W` (toggle main window visibility). Lifecycle integrado com `lifecycle.onQuit` pra unregister.
- Preload bridge: `window.g4osShortcuts.onNewTurn(cb)` (returns unsubscribe).
- Renderer hook `useGlobalNewTurnShortcut` mounta no `__root.tsx`; quando dispara, foca textarea via `[data-composer-textarea]` ou `textarea[role=combobox]`.

**TASK-18-04 — Mermaid renderer migration**:
- `packages/ui/src/markdown/mermaid-block.tsx` — graceful fallback que mostra raw code num `<pre>` estilizado quando `mermaid` (~500KB) não está instalado. Lazy import via dynamic specifier opaco — promove a SVG render quando dep for adicionada.
- `registerBuiltinCustomBlocks()` em `@g4os/ui/markdown` registra `MermaidBlock` no `customBlockRegistry` por chave `'mermaid'`. Chamado uma vez no boot do renderer.
- 2 keys i18n novas: `markdown.mermaid.renderError` em pt-BR/en-US.

**TASK-18-05 — Codex-types migration**:
- Novo pacote `@g4os/codex-types` (types-only, sem deps) com types do protocolo NDJSON do Codex CLI. `protocol.ts` em `@g4os/agents` agora re-exporta — package externo é source of truth.
- Cruiser rule `agents-layered` atualizada pra permitir dep em `codex-types`.

**TASK-10B-13a slice 1 — Server-side trace spans**:
- `withTelemetry` middleware do `@g4os/ipc` agora abre span OTel real por procedure call (era no-op). Atributos: `rpc.system`, `rpc.method`, `rpc.type`, `rpc.user_id`. Status `ERROR` + exception event quando procedure retorna `TRPCError` ou throw. NOOP sem SDK (default `@opentelemetry/api` tracer).
- `@opentelemetry/api 1.9.0` adicionada como dep do `@g4os/ipc`.
- Slice 2 (renderer→main propagation via custom tRPC link + `traceparent` no envelope IPC) fica como follow-up.

**Cleanup**: TASK refs removidos dos comentários conforme `check:comment-rot` (zero-tolerance). Main-size budget bumped 9300 → 9400 (global-shortcuts.ts ~85 LOC).
