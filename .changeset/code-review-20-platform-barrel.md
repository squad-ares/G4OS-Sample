---
'@g4os/platform': patch
---

CR-20 F-P20-1: omite `_resetForTestingInternal` do barrel público de `@g4os/platform`.

Helper test-only vazava via `export * from './runtime-paths.ts'` para `dist/index.d.ts` e `dist/index.cjs`. Substituído por re-export explícito de `initRuntimePaths`/`runtime`/`validateRuntimeIntegrity`. Tests já importavam direto de `../runtime-paths.ts`, sem regressão.
