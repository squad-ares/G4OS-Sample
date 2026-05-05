---
'@g4os/desktop': patch
---

Fix env vars de build — Sentry, managed API e viewer URL agora embutidas corretamente

**Problema:** O app buildado no GitHub não aplicava as secrets do repositório porque:
1. O job `build` do `release-desktop.yml` não declarava as vars no bloco `env:`
2. O main process lia `G4OS_SENTRY_DSN`, `G4OS_MANAGED_API_BASE` e `G4OS_VIEWER_URL` via `readRuntimeEnv` (chave variável — esbuild não substitui inline); em apps empacotados `process.env` não contém essas vars

**Correções:**

- `release-desktop.yml`: adiciona ao `env:` do job `build` todas as vars faltantes (`G4OS_SENTRY_DSN`, `G4OS_SENTRY_ENVIRONMENT`, `G4OS_MANAGED_API_BASE`, `G4OS_VIEWER_URL`, `G4OS_DISTRIBUTION_FLAVOR`, `G4OS_RELEASE_CHANNEL`, `G4OS_APP_FLAVOR`)
- `electron.vite.config.ts`: adiciona `buildTimeDefines` para `__G4OS_MANAGED_API_BASE__`, `__G4OS_VIEWER_URL__` e `process.env.G4OS_DISTRIBUTION_FLAVOR` (string literal key — substituível pelo esbuild em `@g4os/platform`)
- `runtime-env.ts`: adiciona `readBuildTimeConst()` — lê as 5 constantes de build time com guard `raw !== name` para degradar graciosamente em testes sem vite
- `observability-runtime.ts`: usa `readBuildTimeConst` para `__G4OS_SENTRY_DSN__`, `__G4OS_SENTRY_ENVIRONMENT__`, `__G4OS_SENTRY_RELEASE__` (já estavam em `buildTimeDefines`, só faltava o leitor correto)
- `news-service.ts`: usa `readBuildTimeConst('__G4OS_VIEWER_URL__')` em vez de `readRuntimeEnv`
- `index.ts`: usa `readBuildTimeConst('__G4OS_MANAGED_API_BASE__')` em vez de `readRuntimeEnv` para o `TranscriptionService`
