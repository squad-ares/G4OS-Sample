# @g4os/platform

Abstração de sistema operacional para o G4 OS v2. Ponto único onde `process.platform` é lido; consumidores nunca precisam saber qual é o OS.

## Exports

```ts
import {
  // Paths canônicos (config, data, cache, state, logs, workspace)
  getAppPaths,

  // Platform info — família, arch, versão, homeDir, tempDir
  getPlatformInfo,
  getHomeDir,
  getTempDir,
  getDistributionFlavor,
  getAppName,
  getProtocolName,
  isMacOS,
  isWindows,
  isLinux,

  // Runtime bundle paths
  initRuntimePaths,
  validateRuntimeIntegrity,

  // Install manifest + hash check
  loadInstallMeta,
  verifyRuntimeHashes,
  sha256OfFile,

  // Keychain cross-platform
  type IKeychain,

  // Types
  type AppPaths,
  type PlatformInfo,
  type InstallMeta,
  type RuntimeName,
  type IntegrityFailure,
} from '@g4os/platform';
```

> `_resetForTestingInternal` é helper test-only exportado diretamente de
> `'@g4os/platform/src/runtime-paths.ts'` — não faz parte do barrel público.
>
> `runtime` (builders de path de runtime) é privado do módulo — use
> `loadInstallMeta` + `verifyRuntimeHashes` para verificação de integridade.

## Responsabilidades

- **`paths.ts`** — resolve diretórios canônicos via [`env-paths`](https://www.npmjs.com/package/env-paths) (macOS Keychain, Windows APPDATA, Linux XDG). Único import de `env-paths` no monorepo; consumidores usam `getAppPaths()`.
- **`runtime-paths.ts`** — em releases empacotadas, os runtimes (`node`, `pnpm`, `uv`, `python3`, `git`) são validados por SHA-256 contra um manifesto antes do chat iniciar. Em dev, o runtime resolve do path de desenvolvimento.
- **`keychain.ts`** — contrato `IKeychain` (get/set/delete/list) consumido por `@g4os/credentials`. Implementações concretas (safeStorage, file, memory) vivem no pacote de credenciais.

## Fronteiras

`@g4os/platform` depende apenas de `@g4os/kernel` e de libs do Node nativas/`env-paths`. Nunca importa `electron`, pacotes de domínio ou `@g4os/credentials`.

## ADRs relacionadas

- **ADR-0013:** Abstração de plataforma — `@g4os/platform` como ponto único de `process.platform` e `env-paths`
- **ADR-0106:** Preflight de startup e contrato de env
