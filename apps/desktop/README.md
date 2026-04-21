# @g4os/desktop

## Contrato de startup

O app desktop bloqueia `dev` e `build` quando o contrato de env do Supabase está incompleto.

Variáveis obrigatórias:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`

Localizações aceitas:

- `.env` na raiz do repositório
- `.env.local` na raiz do repositório

Fonte única de verdade para parse e validação: [`@g4os/auth/supabase`](../../packages/auth/src/supabase) (`loadSupabaseEnvFiles`, `validateSupabaseEnv`). O app importa esses helpers tanto no `electron.vite.config.ts` quanto no `startup-preflight-service.ts` — não há mais um `shared/desktop-env.ts` separado.

## Preflight de startup

[`apps/desktop/src/main/startup-preflight-service.ts`](src/main/startup-preflight-service.ts) roda antes de carregar o renderer e é responsável por:

- validar o contrato de env Supabase via `@g4os/auth/supabase`
- criar os diretórios de app que podem ser auto-reparados com segurança
- checar integridade do bundle de runtime
- classificar issues como `fatal`, `recoverable` ou `informational`
- expor erros fatais de build empacotada via `dialog.showErrorBox`

O main só carrega a `BrowserWindow`, registra IPC e só então carrega a URL do renderer. Isso evita a tela branca que existia quando o guard do router corria paralelamente ao handler tRPC do Electron.

## Wiring atual

Montado em [`src/main/index.ts`](src/main/index.ts):

- `@g4os/observability` — `initTelemetry` + `initSentry` + `MemoryMonitor` (opt-in via env — ver [`docs/setup.md`](../../docs/setup.md))
- `@g4os/credentials` — `createVault({ mode })` com `safeStorage` em produção, file+codec em dev
- `@g4os/auth` — `ManagedLoginService` + `SessionRefresher` + adapter Supabase (`@g4os/auth/supabase`) com `AuthTokenStore` backed pelo CredentialVault

Wiring ainda **pendente** (documentado em `STUDY/Audit/Tasks/10b-wiring`):

- `@g4os/data` — `initDatabase` entra junto com event-sourced sessions (Epic 11)
- `@g4os/agents` + `@g4os/sources` — registries entram quando houver features de sessão (Epic 11)

## ADRs relacionadas

- `docs/adrs/0106-startup-preflight-and-env-contract.md`
- `docs/adrs/0107-authenticated-shell-navigation-matrix.md`
- `docs/adrs/0100-window-manager-state-persistence.md`
- `docs/adrs/0101-tanstack-router-file-based-routing.md`
- `docs/adrs/0102-theme-system-context-css-vars.md`
- `docs/adrs/0104-platform-provider-renderer-isolation.md`
- `docs/adrs/0105-app-shell-auth-guard-layout.md`
