---
'@g4os/platform': patch
---

Code Review 43 — packages/platform — boundary, contrato e drift documental

Auditoria exaustiva do `@g4os/platform` (sources: `index.ts`, `platform-info.ts`, `paths.ts`, `runtime-paths.ts`, `install-meta.ts`, `keychain/interface.ts`, `spawn/interface.ts`, `process-types.ts`, `__tests__/**`). Cruzado contra ADR-0011 (Result), 0012 (Disposable), 0013 (platform abstraction — único `process.platform`), 0100 (window manager state — não tocado aqui), 0104 (renderer isolation), 0106 (preflight env contract), 0152 (sources boundary), 0153 (catalog), 0158 (single-instance lock).

**Veredito**: o pacote cumpre o contrato central do ADR-0013 (todos os `process.platform` ficam aqui; gate `check:platform-leaks` ativo). Mas há drift entre **superfície declarada** (README + barrel + types) e **superfície usada** (zero consumers). Isso é a categoria de bug que ADR-0013 prevê: "API que existe mas ninguém usa erode pra ficar inconsistente sem ninguém perceber". CR-20 F-P20-1 já mexeu no barrel — esta auditoria estende o saneamento.

## Findings

### F-CR43-1 — `process-types.ts` + `spawn/interface.ts` são dead code re-exportado pelo barrel (MAJOR)
- **File**: `packages/platform/src/process-types.ts:1-48` + `packages/platform/src/spawn/interface.ts:1-16` + `packages/platform/src/index.ts:5,15`.
- **Root cause**: types `ProcessHandle`, `ProcessKind`, `ProcessStats`, `ProcessStatus`, `RestartPolicy`, `SpawnConfig`, `SpawnPolicy`, `ISpawner` foram desenhados para `TASK-03-02 utility-process-supervisor` / `TASK-03-03 worker-per-session`. ADR-0145 superseded ADR-0030 — worker-per-session foi deletado em MVP-CLEAN (2026-04-24). Os tipos sobreviveram no barrel sem nenhum consumer (`grep -rn "ProcessHandle\|ISpawner\|SpawnConfig"` em `packages/`+`apps/` retorna **0** matches fora de `platform/src` e `platform/dist`). Pior: `ProcessKind` colide nominalmente com `ProcessKind` em `@g4os/observability/sdk` (`'main' | 'worker' | 'renderer'` vs `'session' | 'mcp' | 'cpu-worker'`) — qualquer consumer futuro que faça `import { ProcessKind } from '@g4os/platform'` vs `'@g4os/observability'` recebe enum incompatível silenciosamente.
- **Fix**: deletar `process-types.ts` e `spawn/interface.ts` + remover `export * from './process-types.ts'` e `export * from './spawn/interface.ts'` de `index.ts`. Mover `ISpawner`/`SpawnPolicy` para `@g4os/agents/tools/shared` se ressuscitarem (atualmente o que existe é `shell-launcher.ts:resolveShell`, sem interface formal). Se houver intenção de reintroduzir process supervision, novo ADR superseding 0145.
- **ADR**: 0013 (boundary do pacote — não exportar tipo sem consumer), 0145 (in-process único), 0152 (boundary).

### F-CR43-2 — `runtime` const com `claudeSdkCli/interceptor/sessionMcpServer/bridgeMcpServer/git/node/uv` é dead code (MAJOR)
- **File**: `packages/platform/src/runtime-paths.ts:32-77` + `packages/platform/src/index.ts:10-14`.
- **Root cause**: `grep -rn "import.*runtime.*from '@g4os/platform'"` em `packages/`+`apps/` retorna **0** matches. O export `runtime` (com 7 builders de path) é re-exportado explicitamente pelo barrel mas nunca consumido. `validateRuntimeIntegrity()` chama `runtime.claudeSdkCli()` etc. internamente (`runtime-paths.ts:92-97`), porém o objeto exposto é dead surface para o resto do monorepo. Sintoma de drift: a verdadeira identidade-de-runtime virou `install-meta.ts` (com SHA-256), mas `runtime-paths.ts` (existsSync-only) ainda é exportada como se fosse contrato. Risco real: novo dev importa `runtime.git()` achando que valida hash, recebe path nu sem verificação.
- **Fix**: tornar `runtime` privado do módulo (não exportar pelo barrel). `validateRuntimeIntegrity` continua usando internamente. Documentar em README que **a única API pública de integridade é `loadInstallMeta` + `verifyRuntimeHashes`** (com SHA-256), não `runtime.X()`.
- **ADR**: 0013 (superfície minimalista), 0106 (preflight contract — quem deve fazer a verificação real).

### F-CR43-3 — `loadInstallMeta` callers nunca passam `target`, anulando CR-38 F-CR38-2 (MAJOR)
- **File**: `packages/platform/src/install-meta.ts:117-208` (contrato) ↔ `apps/desktop/src/main/startup-preflight-service.ts:130-133` + `apps/desktop/src/main/services/preferences-service.ts:73`.
- **Root cause**: CR-38 introduziu `LoadInstallMetaOptions.target` para falhar cedo com `target_mismatch` (build win32 carregado em macOS, build x64 em rosetta sem rebuild) em vez da cascata `runtime_missing × N`. O contrato e o teste existem (`install-meta.test.ts:79-99` testa `app_version_mismatch`, mas não há teste de `target_mismatch`), mas **nenhum consumer real passa `target`**. `startup-preflight-service.ts:130-133` propaga só `appVersion`. Resultado: o failure mode `target_mismatch` é inalcançável em produção — exatamente o que o JSDoc do código (`install-meta.ts:96-104`) afirma evitar.
- **Fix**: callers devem montar `target` via `${getPlatformInfo().family}-${getPlatformInfo().arch}` (mapeando `macos→darwin`, `windows→win32` para casar `meta.target`) e passar em `loadInstallMeta`. Em paralelo, documentar no JSDoc do parâmetro o formato canônico esperado (hoje só diz "ex: `darwin-arm64`"). Adicionar teste `loadInstallMeta returns target_mismatch when targets diverge`.
- **ADR**: 0106 (preflight: failure modes devem ser exercidos no boot real, não só em test fixture).

### F-CR43-4 — JSDoc de `AppPaths` mente sobre os caminhos resolvidos (MEDIUM)
- **File**: `packages/platform/src/paths.ts:14-31`.
- **Root cause**: `AppPaths.config` documentado como `~/.config/g4os`, mas `envPaths()` retorna paths OS-aware:
  - macOS: `~/Library/Preferences/g4os-nodejs` (config), `~/Library/Application Support/g4os-nodejs` (data) — nota: `env-paths` adiciona `-nodejs` por default; o `{ suffix: '' }` aqui evita isso.
  - Windows: `%APPDATA%/g4os/Config`, `%LOCALAPPDATA%/g4os/Data`.
  - Linux: `~/.config/g4os`, `~/.local/share/g4os`.
  - `credentialsFile`/`workspace`/`session`/`logs` documentados como `~/.g4os/...` que **não corresponde a nenhum SO** — é prefixo Linux antigo que nunca foi a realidade pós-`env-paths` (paths.ts:23-29). Confunde leitor (revisor de código olha o path real no FS e acha que está bugado), confunde suporte (instruções de "limpar cache" com path errado).
- **Fix**: substituir os blocos JSDoc por comentário explicando "resolvido via `env-paths` — Linux: `~/.config/g4os/`, macOS: `~/Library/Application Support/g4os/`, Windows: `%APPDATA%/g4os/Config/`. Use `getAppPaths().config` e nunca hardcode". Padrão ADR-0013: tipos > comentários, mas quando existe comentário, ele tem que estar correto.
- **ADR**: 0013 (centralizar conhecimento; documentação errada é pior que ausência).

### F-CR43-5 — `getAppPaths()` usa cache module-level criado a partir de env capturado em load-time (MEDIUM)
- **File**: `packages/platform/src/paths.ts:9-12`.
- **Root cause**: `const APP_NAME = getAppName()` e `const paths = envPaths(APP_NAME, ...)` rodam **na primeira import** do módulo. `getAppName()` lê `G4OS_DISTRIBUTION_FLAVOR` via `process.env`. Em testes (vitest reusa workers), em `apps/desktop` (preflight pode setar env após `dotenv.config()`), ou em multi-runner CI, qualquer setter de env após o primeiro `import '@g4os/platform'` é ignorado silenciosamente. O `_platformInfo` em `platform-info.ts:54-91` tem o mesmo padrão lazy-singleton mas **com função de boundary explícita** (`getPlatformInfo()` chama detect na 1ª invocação, não em load); `paths.ts` não — chama `envPaths` em load. Inconsistência entre módulos.
- **Fix**: lazy-init via singleton em `getAppPaths()` (mesma forma que `_platformInfo`): `let _paths: ReturnType<typeof envPaths> | null = null; function ensurePaths() { if (!_paths) _paths = envPaths(getAppName(), ...); return _paths; }`. Garante que o env é lido na 1ª chamada, não no `import`. Side-benefit: testes de paths (`platform.test.ts:73-119`) ganham determinismo.
- **ADR**: 0013 (singleton-by-design só faz sentido com boundary explícito de inicialização).

### F-CR43-6 — `verifyRuntimeHashes` não detecta symlink escape do `vendorDir` (MEDIUM)
- **File**: `packages/platform/src/install-meta.ts:228-255`.
- **Root cause**: o regex em `binaryRelativePath` (linhas 52-61) bloqueia `..`, paths absolutos, drive letters, UNC, NULL bytes — defesa contra manifesto adulterado. Mas se o atacante consegue escrever no `vendorDir` (cenário de CR-38 F-CR38-1) E criar um **symlink** dentro dele (`vendorDir/node/bin/node` → `/etc/passwd`), o regex passa, `existsSync` passa, e `sha256OfFile` computa hash de arquivo arbitrário fora do tree. Comparação de hash falha → `failures: hash_mismatch` exposto na UI Repair Mode com hash de `/etc/passwd`. Risco real: baixo (write em vendor já é game over), mas defesa-em-profundidade declarada no comentário (`install-meta.ts:42-49`) não é integral — mesmo argumento pediria realpath check.
- **Fix**: após `join(vendorDir, name, entry.binaryRelativePath)` chamar `realpathSync(binaryPath)` e validar `realpath(vendorDir).startsWith()` via `path.relative`/`!startsWith('..')` (o pattern já documentado em CLAUDE.md "Path safety em tool handlers" usando `path.relative` cross-platform). Ignorar se symlink está fora do escopo de threat model — registrar comentário explícito.
- **ADR**: 0013 + CR-38 F-CR38-1 (consistência de defense-in-depth).

### F-CR43-7 — README documenta exports inexistentes `initAppPaths` e `resolveBundledBinary` (MEDIUM)
- **File**: `packages/platform/README.md:8-21`.
- **Root cause**: README enumera 6 exports — `getAppPaths`, `initAppPaths`, `initRuntimePaths`, `validateRuntimeIntegrity`, `resolveBundledBinary`, `IKeychain`. **`initAppPaths` e `resolveBundledBinary` não existem no barrel** (`grep -rn "initAppPaths\|resolveBundledBinary"` retorna 0). Drift entre prose docs e barrel real é exatamente o que ADR-0153 (catalog) e ADR-0013 (single source) vêm combatendo em outras dimensões. Onboard de novo dev quebra na 1ª tentativa de importar do README.
- **Fix**: regenerar o snippet de exports a partir da árvore real do `index.ts` (`getAppPaths`, `getPlatformInfo`, `getHomeDir`, `getTempDir`, `getDistributionFlavor`, `getAppName`, `getProtocolName`, `isMacOS`/`isWindows`/`isLinux`, `initRuntimePaths`, `validateRuntimeIntegrity`, `loadInstallMeta`, `verifyRuntimeHashes`, `sha256OfFile`, types `IKeychain`/`PlatformInfo`/`AppPaths`/`InstallMeta`). Bonus: documentar que `_resetForTestingInternal` é test-only e omitido do barrel (CR-20).
- **ADR**: 0013 (docs rotam; nome bom > comentário, mas se há comentário ele precisa casar com o código).

### F-CR43-8 — `PlatformInfo.isPackaged|isDev|isWsl|pathSeparator|executableSuffix` são dead public surface (LOW)
- **File**: `packages/platform/src/platform-info.ts:13-91`.
- **Root cause**: `getPlatformInfo()` retorna 10 campos. `grep -rn "platformInfo\.\|getPlatformInfo()\."` em `packages/`+`apps/` (excluindo dist/tests/platform-src) mostra apenas `.family` consumido (em `sources/mcp-stdio/factory.ts:22` e `apps/desktop/.../platform-service.ts:15`). Os outros 9 campos são exposta superfície sem consumer:
  - `isPackaged`: apps usam `electron.app.isPackaged` direto (window-manager, single-instance, startup-preflight). A derivação de platform (`!process.defaultApp`) é heurística e diverge do oracle real do Electron.
  - `isDev`: `kernel/logger.ts:64` faz a sua própria via `readProcessEnv('NODE_ENV')`.
  - `isWsl`/`pathSeparator`: zero consumers.
  - `executableSuffix`: usado só interno em `runtime-paths.ts:58/67/73`.
- O risco é o que ADR-0013 chama de "código que existe e ninguém usa" — drift quase certo. Pior: ter `isPackaged` em platform-info induz consumer a usar isso ao invés do oracle electron, levando a divergências (ex.: em utility-process não-electron, `isPackaged` retorna `false` mas processo real é packaged).
- **Fix**: enxugar `PlatformInfo` para `{ family, arch, version, homeDir, tempDir }`. Mover `executableSuffix` para função privada de `runtime-paths.ts`. Deletar `isPackaged`/`isDev`/`isWsl`/`pathSeparator` do contrato — quem precisar reintroduz com consumer real e teste. Sinaliza ao próximo dev que platform é abstração de SO, não de runtime context (Electron vs Node).
- **ADR**: 0013 (minimal surface).

### F-CR43-9 — Biome exemption stale: `paths.ts` não usa mais `process.env` (LOW)
- **File**: `biome.json:208-222`.
- **Root cause**: a override list para `noProcessEnv: off` inclui `**/paths.ts`. Mas após CR-23 F-CR23-3, `paths.ts` lê `getAppName()` via `platform-info.ts` — não toca `process.env` direto. Exemption é dead config; baixíssimo risco mas confunde leitor que tenta entender a regra (e impede que nova regressão seja flagrada se alguém readicionar `process.env['G4OS_X']` em `paths.ts`).
- **Fix**: remover `**/paths.ts` da lista de overrides. Os outros (`platform-info.ts`, `binary-resolver.ts`, etc.) seguem necessários.
- **ADR**: 0013 (gates devem refletir o estado atual; contornos antigos viram cobertura ilusória).

### F-CR43-10 — `RUNTIME_NAMES` declara `pnpm` e `python` mas nem `runtime-paths.ts` nem `bundle-runtimes` script expõem path helper para eles (LOW)
- **File**: `packages/platform/src/install-meta.ts:28` ↔ `packages/platform/src/runtime-paths.ts:32-77`.
- **Root cause**: `RUNTIME_NAMES = ['node', 'pnpm', 'uv', 'python', 'git']` é o conjunto **validável** pelo SHA-256. Mas `runtime` const só expõe `git()`/`node()`/`uv()` — nem `pnpm()` nem `python()`. Em runtime, se o manifesto inclui `pnpm` e o consumer quer o path, precisa hardcodar `join(vendorDir, 'pnpm', 'pnpm${suffix}')` — exatamente o tipo de fan-out que ADR-0013 previne. Contrato implícito: install-meta sabe tudo, runtime-paths sabe um subset arbitrário. Após F-CR43-2 acima (mover `runtime` para privado) este finding é parcialmente mitigado, mas a inconsistência permanece se algum consumer eventual precisar disso.
- **Fix**: refatorar `runtime-paths` para gerar paths a partir do manifest (`InstallMeta.runtimes[name].binaryRelativePath`), ou explicitar que `runtime.X()` cobre só o subset bundled-by-default e que `pnpm`/`python` não são usados em produção (caso real — checar). README deve documentar que **a única fonte verdadeira de "qual binário existe" é `meta.runtimes`**.
- **ADR**: 0013 (single source of truth também para a lista de runtimes).

### F-CR43-11 — Teste `validateRuntimeIntegrity returns ok when files exist` não exercita ramo de sucesso (LOW)
- **File**: `packages/platform/src/__tests__/platform.test.ts:151-175`.
- **Root cause**: o teste cria os 4 arquivos esperados, chama `initRuntimePaths`, mas o `try/catch` (linhas 166-170) silencia `Runtime paths already initialized` e o teste só valida `typeof result.ok === 'boolean'` — não que `result.ok === true`. Se o reset (linha 134) falhar, o teste passa com `ok: false` (estado do teste anterior). CR-18 F-P3 introduziu `_resetForTestingInternal` exatamente para resolver esse problema; o teste ainda depende do try/catch defensivo de antes.
- **Fix**: remover try/catch, deixar `initRuntimePaths` lançar se já inicializado (sinaliza bug no `afterEach`); assertar `expect(result.ok).toBe(true)` e `expect(result.missing).toEqual([])`.
- **ADR**: 0011 (testar happy + sad path explicitamente).

## Resumo

11 findings: 3 MAJOR, 4 MEDIUM, 4 LOW.

Padrão dominante: **drift entre superfície declarada e superfície usada** (F-CR43-1, 2, 7, 8, 10) e **defesa-em-profundidade incompleta** quando um helper foi introduzido com objetivo X mas o caller real não exercita X (F-CR43-3, 6). Nenhum bug de renderer isolation (ADR-0104) — platform não importa Electron/electron, só Node stdlib + `env-paths` + `@g4os/kernel`. Nenhum bug de boundary (ADR-0152) — `package.json` deps são `@g4os/kernel + env-paths + zod`, dependency-cruiser `platform-only-on-kernel` ativa.

Áreas que estão **sólidas**:
- `assertSafeId` em `paths.ts:36-43` (defesa contra path traversal em workspace/session ids).
- `getDistributionFlavor` regex (CR-23 F-CR23-3) — fonte única + validação consistente.
- `binaryRelativePath` regex (CR-38 F-CR38-1) — bloqueia `..`/absolute/UNC/NULL.
- `hexEquals` timing-safe (`install-meta.ts:283-290`) — defense-in-depth correto.
- `loadInstallMeta` failure modes tipados (não `Error` genérico).

Áreas com **gap**:
- Surface API drift (F-CR43-1, 2, 7, 8, 10).
- Caller-side discipline em `loadInstallMeta` (F-CR43-3).
- JSDoc factual (F-CR43-4).
