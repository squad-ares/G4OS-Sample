# bundle-runtimes

Download, verify e extract runtimes bundled (Node, pnpm, uv, Python, Git) para
dentro de `apps/desktop/dist/vendor/<runtime>/`. Consumido por
`electron-builder.config.ts` via `extraResources`.

## Uso

```bash
# Bundle full profile para a plataforma corrente (macOS arm64, por exemplo)
pnpm -C apps/desktop prebundle

# Override plataforma/arch para cross-bundle (usado em CI matrix)
G4OS_BUNDLE_PLATFORM=win32 G4OS_BUNDLE_ARCH=x64 pnpm -C apps/desktop prebundle
```

## Flags

| Env var | Valores | Default | Efeito |
|---|---|---|---|
| `G4OS_BUNDLE_PROFILE` | `light` \| `full` | `full` | `light`: só Node + pnpm. `full`: + uv, Python, Git |
| `G4OS_BUNDLE_PLATFORM` | `darwin` \| `win32` \| `linux` | `process.platform` | Plataforma alvo |
| `G4OS_BUNDLE_ARCH` | `x64` \| `arm64` | `process.arch` | Arch alvo |
| `G4OS_BUNDLE_OUTPUT` | `<dir>` | `apps/desktop/dist` | Saída |
| `G4OS_BUNDLE_CHECKSUM_MODE` | `verify` \| `capture` | `verify` | `capture` grava `checksums.json` na primeira vez |

## Fluxo de integridade

1. **Primeira execução:** rodar com `G4OS_BUNDLE_CHECKSUM_MODE=capture` para
   popular `checksums.json` com SHA-256 de cada archive.
2. **Commitar** `checksums.json`.
3. **Execuções subsequentes** (default `verify`): qualquer mismatch de SHA-256
   quebra o build imediatamente.

## Bump de versão

1. Editar `versions.ts` com novas versões pinadas.
2. Rodar `G4OS_BUNDLE_CHECKSUM_MODE=capture pnpm -C apps/desktop prebundle`
   para cada plataforma × arch relevante.
3. Commitar `versions.ts` + `checksums.json` no mesmo PR.

## Layout após extração

```
apps/desktop/dist/vendor/
├── node/
│   └── node-v24.10.0-darwin-arm64/bin/node
├── pnpm/
│   └── pnpm
├── uv/
│   └── uv-aarch64-apple-darwin/uv
├── python/
│   └── python/bin/python3.12
└── git/   (só Windows)
    └── cmd/git.exe
```

## Limitações conhecidas

- **Git** bundle só em Windows; macOS/Linux usam git de sistema. Documentar
  para usuário no onboarding.
- **python-build-standalone** publica release por data — `pythonBuildTag` em
  `versions.ts` precisa bater com uma release real em
  [astral-sh/python-build-standalone](https://github.com/astral-sh/python-build-standalone/releases).
- Cache fica em `os.tmpdir()/g4os-runtime-cache` — persistente entre builds
  locais, limpa com `rm -rf $(node -e 'console.log(require("os").tmpdir())')/g4os-runtime-cache`.
