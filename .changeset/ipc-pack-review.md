---
'@g4os/ipc': patch
'@g4os/desktop': patch
---

Pack-review IPC: split, contract, Result wrapping.

- `packages/ipc/src/server/context.ts` (507 LOC) split em `context.ts` (composition root: `IpcInvokeEventLike`/`IpcContext`/`ServiceStatus`/`ServicesStatusMap`) + novo `context-services.ts` que concentra os 18 service interfaces (`WorkspacesService`, `SessionsService`, `MessagesService`, `ProjectsService`, `CredentialsService`, `PermissionsService`, `SourcesService`, `AgentsService`, `AuthService`, `MarketplaceService`, `NewsService`, `SchedulerService`, `UpdatesService`, `VoiceService`, `WindowsService`, `WorkspaceTransferService`, `LabelsService`, `PreferencesService`, `BackupService`, `PlatformService`) + tipos auxiliares (`BranchSessionInput`, `PermissionDecisionInput`, `IpcSession`, …). `context.ts` re-exporta tudo, mantendo a superfície pública estável (`@g4os/ipc/server`). Resolve gate `check:file-lines` (limite 500).
- `health.{ping,version,servicesStatus}`, `workspaces.list`, `auth.{getMe,signOut}` agora declaram `.input(z.void())` explícito — README do pacote e ADR-0020 exigem input+output declarados, e o restante das procedures parameterless (`auth.managedLoginRequired`, `agents.list`, `updates.check`, …) já seguia o padrão.
- `VoiceService.transcribe` passa a retornar `Promise<Result<string, AppError>>` em vez de `Promise<string>` cru — alinha com ADR-0011 (Result para erros esperados). `TranscriptionService` (apps/desktop) embrulha o impl interno com `toResult(..., ErrorCode.NETWORK_ERROR)`. `null-services.ts` e `create-test-caller.ts` mocks atualizados; `voice-router.ts` consumidor faz `if (result.isErr()) throw result.error;` para preservar o envelope superjson para o renderer.
