---
'@g4os/agents': patch
'@g4os/auth': patch
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

TASK-14-01 Slice 3 — `migrate-sources`, `migrate-skills`, `migrate-sessions` reais. Stubs zerados.

- **`migrate-sources`** (real): lê `<v1>/sources.json` global, parsing tolerante (aceita `{sources: [...]}`, `[...]` direto, ou `{}`). Distribuição: explicit `workspaceIds[]` ou fallback pra `knownWorkspaceIds` quando V1 não especifica. Skipa entradas sem slug ou com kind inválido. Idempotente via `sourceWriter.exists(wid, slug)`. Modo read-only sem writer (count + validate).
- **`migrate-skills`** (real): copia `<v1>/skills/` → `<v2>/skills-legacy/` byte-a-byte preservando estrutura. NÃO converte schema agora (feature V2 11-features/10 ainda não existe). Sempre emite warning instruindo re-import futuro. Idempotente via existsSync target dir. Dry-run reporta sem copiar.
- **`migrate-sessions`** (real): lê `<v1>/workspaces/<wid>/sessions/<sid>/{session.json,session.jsonl}`, mapeia metadata pra V2 + valida eventos via `SessionEventSchema` (Zod). Eventos com type desconhecido viram warning + skip. Gera `eventId`/`sequenceNumber`/`timestamp` quando V1 omite. Idempotente via `sessionWriter.existsSession()`. Modo read-only sem writer.
- **Contract estendido** com `V2SourceWriter`/`V2SourceInput`, `V2SessionWriter`/`V2SessionMetadata`, e `knownWorkspaceIds` em `StepOptions`. Contract exportado pelo barrel.
- **Stubs.ts removido** — todos os 6 steps agora têm implementação real (config + credentials + workspaces + sources + sessions + skills).
- **18 testes novos** (sources: 6, skills: 5, sessions: 6, executor atualizado: 1) totalizando **49 testes passando** no pacote (+18 vs slice 2).
- Migration package agora tem cobertura de teste em todos os steps com fixtures tmpdir + writers mockados.
