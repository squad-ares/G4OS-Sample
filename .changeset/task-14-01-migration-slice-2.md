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

TASK-14-01 Slice 2 — `migrate-credentials` + `migrate-workspaces` reais.

- `StepContext` agora carrega `options: StepOptions` com dependências externas opcionais (`v1MasterKey`, `vault`, `workspaceWriter`). Steps que precisam delas e não recebem retornam `Result.err` com mensagem clara — caller decide.
- `migrate-credentials` (real): wire para `@g4os/credentials/migration.migrateV1ToV2()` (que já lê `credentials.enc` AES-GCM, sanitiza chaves, detecta colisões, é idempotente). Skipa graciosamente quando V1 não tem `credentials.enc`. Erra com diagnóstico se `vault` ou `v1MasterKey` faltam, ou se TODAS as credenciais falharem (sinaliza masterKey errada).
- `migrate-workspaces` (real): lê `<v1>/workspaces/<uuid>/workspace.json` com Zod schema permissivo, mapeia para `V2WorkspaceInput`, escreve via `V2WorkspaceWriter` callback. Modo read-only (sem writer): conta + valida, útil em dry-run. Idempotente via `writer.exists(id)` skip. Tolera dirs órfãos, JSON malformado, falha de write — todos viram warnings não-fatais.
- Stubs reduzidos de 5 para 3 (`sessions`, `sources`, `skills`).
- 10 testes novos (workspaces: 7, credentials: 3) + executor test atualizado pra usar `sessions` como stub que erra. **31 testes passando** no pacote.
- `@g4os/migration` ganhou deps `@g4os/credentials` + `zod` (catalog).
