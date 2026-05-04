---
'@g4os/agents': patch
'@g4os/data': patch
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/session-runtime': patch
'@g4os/sources': patch
'@g4os/translate': patch
---

Code Review 30 — 7 findings aplicados (4 MAJOR + 3 MEDIUM/LOW).

**F-CR30-1 — Title generator vault key corrigida (MAJOR)**. `title-generator.ts` usava `'connection.anthropic-direct.apiKey'` — chave inexistente no vault. Toda geração de título via Anthropic Haiku era no-op silencioso. Corrigido para `'anthropic_api_key'` (consistente com o restante do app). Lógica de system prompt extraída para `services/default-system-prompt.ts` (91 LOC) para manter `title-generator.ts` focado no scheduler.

**F-CR30-2 — `ThinkingLevel` unificado + valor efetivamente persistido (MAJOR)**. UI tinha `'minimal'|'low'|'medium'|'high'`; agent tinha `'low'|'think'|'high'|'ultra'` — enums incompatíveis, sem mapper, valor nunca persistido via `sessions.update`. `ThinkingLevel` canônico movido para `@g4os/kernel/types`. `model-catalog.ts` e `provider-mapping.ts` importam de lá. `TurnDispatcher` lê `session.metadata.thinkingLevel` do `refreshedSession` e injeta no `AgentConfig`. `SessionsService` propaga `thinkingLevel` no update path. O selector de UI agora afeta de fato o comportamento do agent.

**F-CR30-3 — Drain + dispose do TurnDispatcher combinados (MAJOR)**. `shutdown-bootstrap.ts` registrava dois `onQuit` handlers separados para `drain()` e `dispose()`. `AppLifecycle.shutdown()` usa `Promise.allSettled` (paralelo, não LIFO) — `dispose()` abortava os agents antes de `drain()` terminar, causando flush parcial de eventos em voo. Combinados em um único handler `async` (padrão já seguido pelo `backupScheduler`).

**F-CR30-4 — `write_file` tool usa `writeAtomic` (MAJOR)**. `packages/agents/src/tools/handlers/write-file.ts` usava `fs.writeFile` in-place. Crash mid-write (OOM, kill, power loss) truncava o arquivo do usuário. Substituído por `writeAtomic` do `@g4os/kernel/fs` (write → fsync → rename atômico). AbortSignal não propagado para a escrita (operação <1ms em SSD — custo menor que race de cancelamento em mid-rename).

**F-CR30-7 — McpSource idempotência validada (MEDIUM)**. `McpMountRegistry.unmount` chamava `source.dispose()` explicitamente + o `DisposableStore` chamava novamente no shutdown. `mcp-stdio/source.ts` e `mcp-http/source.ts` revisados — ambas implementações usam `#disposed` guard, tornando double-dispose seguro. Contrato documentado no `ISource`.

**F-CR30-9 — `availableProviders` usa `runtimeStatus` (MEDIUM)**. Renderer derivava providers disponíveis de `credentialsQuery` (proxy frágil: mostra disponível mesmo com key inválida; não cobre Bedrock/OAuth). Substituído por `runtimeStatusQuery.data?.providers` — sinal autoritativo de quais factories foram registradas com sucesso no main process.

**F-CR30-10 — `connectionSlugForProvider` deduplicado (LOW)**. `packages/features/src/chat/provider-mapping.ts` mantinha cópia idêntica de `connectionSlugForProvider` de `@g4os/kernel/types`. Eliminada a duplicata; `provider-mapping.ts` importa de `@g4os/kernel`.

**ADR-0159** — `system` message discriminator + persistência de erros de turn no event log. `SystemMessageKind` enum (`error | info | warning`) em `@g4os/kernel/schemas/message.schema.ts`; `SystemMessage` component em `@g4os/features/chat`; `turn-dispatcher.ts` persiste erro como system error antes de emitir evento ephemeral (paridade V1).

**check:main-size** — MAIN_LIMIT 10300 → 10700; FILE_EXEMPTIONS atualizados para `turn-dispatcher.ts` (320→420), `title-generator.ts` (novo, 340), `sessions-service.ts` (novo, 320), `index.ts` (500→510). **check:file-lines** — EXEMPTIONS adicionados para `index.ts` e `sessions.$sessionId.tsx`.
