# Guia de setup do ambiente de desenvolvimento — G4 OS v2

Este documento descreve o fluxo completo para subir o monorepo `@g4os/monorepo` em uma máquina limpa e rodar o app desktop em modo `dev`.

## 1. Pré-requisitos de sistema

| Ferramenta | Versão mínima | Observação |
|---|---|---|
| macOS / Windows 10+ / Linux (Ubuntu 20.04+) | — | plataformas suportadas |
| Node.js | 24 LTS | `.nvmrc=24`; pnpm faz auto-fetch via `.npmrc` (`use-node-version=24.10.0`) |
| pnpm | `10.33.0` (pinado no `packageManager`) | `corepack enable` resolve automaticamente |
| git | 2.40+ | — |

Nenhuma instalação global de Python, uv, ou banco de dados é necessária para `dev`. Os runtimes empacotados existem apenas para builds empacotadas (release).

## 2. Clonagem e dependências

```bash
git clone <repo> g4os-v2
cd g4os-v2

# pnpm auto-resolve Node 24 antes de instalar as deps
pnpm install
```

O `pnpm install` roda automaticamente `lefthook install` via `prepare` script, então os hooks de `commit` e `pre-push` ficam ativos após a primeira instalação.

## 3. Variáveis de ambiente

### 3.1 Supabase (obrigatório)

O app bloqueia `dev` e `build` quando o contrato de env do Supabase está incompleto. Isso é intencional — a V2 não deve subir em modo "silencioso" como a V1 fazia.

1. Copie o template:
   ```bash
   cp .env.example .env
   ```

2. Edite `.env` e preencha:
   ```dotenv
   SUPABASE_URL=https://<projeto>.supabase.co
   SUPABASE_ANON_KEY=<anon-key>
   ```

   A chave aceita dois nomes — `SUPABASE_ANON_KEY` (preferido) ou `SUPABASE_PUBLISHABLE_KEY` (alias legado).

3. Valores moram em Supabase hosted. Não há `docker-compose` local; o projeto usa a instância do time.

A validação acontece em dois pontos:

- **Build-time** (`electron.vite.config.ts`): se o `.env` está vazio ou inválido, o Vite aborta com a mensagem apropriada antes de qualquer compilação.
- **Runtime** (`startup-preflight-service.ts`): no boot do Electron, revalida e — se falhar em produção — mostra um dialog nativo e sai.

### 3.2 Observability (opcional)

Cada pilar é opt-in por env var. Sem nada configurado, o app roda sem telemetria externa (logs vão para stdout em dev).

| Variável | Para que serve |
|---|---|
| `G4OS_SENTRY_DSN` | Habilita crash reporting (main + renderer) |
| `G4OS_SENTRY_ENVIRONMENT` | Default: `development` em dev, `production` em packaged |
| `G4OS_SENTRY_RELEASE` | Default: `app.getVersion()` |
| `G4OS_OTEL_ENDPOINT` | URL de exportador OTLP HTTP (ex: `http://localhost:4318/v1/traces`) |
| `G4OS_OTEL_SAMPLE_RATIO` | `0..1`, default `0.1` |
| `G4OS_MEMORY_INTERVAL_MS` | Intervalo do MemoryMonitor em ms, default `30000` |

ADRs relacionadas: [0060](adrs/0060-pino-structured-logging.md), [0061](adrs/0061-opentelemetry-tracing.md), [0062](adrs/0062-sentry-crash-reporting.md), [0063](adrs/0063-memory-monitoring-leak-detection.md).

## 4. Banco de dados

**Hoje, `pnpm dev` não requer banco de dados.** O pacote `@g4os/data` está implementado (SQLite nativo do Node 24 + Drizzle beta pinado) com migrations versionadas, mas o `main/index.ts` ainda não chama `initDatabase`. O wiring acontece quando Epic 11 (features de domínio) for executado — ver [`STUDY/Audit/Tasks/10b-wiring`](../../G4OS/STUDY/Audit/Tasks/10b-wiring).

Quando o wiring entrar:

- O arquivo default vive em `<appPaths.data>/app.db` (cross-platform via `env-paths`).
- O schema fica em [`packages/data/drizzle/`](../packages/data/drizzle). Migrations aplicam idempotentemente no boot.
- Um backup `*.db.backup-<ts>` é criado antes de qualquer migration (ADR-0045).

Comandos úteis (read-only por enquanto):

```bash
# Inspeciona migrations aplicadas vs. pendentes — não cria o DB.
pnpm db:migrate:status
pnpm db:migrate:status --db /caminho/custom/app.db
```

## 5. Rodar o app

```bash
# Modo dev (HMR para renderer, restart watched para main)
pnpm dev

# Apenas o app desktop
pnpm --filter @g4os/desktop dev

# Build de produção (gera main + preload + renderer em apps/desktop/out/)
pnpm build
```

Em `dev`, o electron-vite abre um DevTools junto com a janela principal. O splash (`ShellLoadingState`) aparece enquanto o auth guard verifica sessão — tipicamente <300ms.

## 6. Gates de qualidade

Rode antes de abrir PR:

```bash
pnpm typecheck                # tsc --noEmit em todo o workspace
pnpm lint                     # biome + check:i18n
pnpm test                     # vitest run em todos os pacotes
pnpm build                    # tsup nos pacotes + electron-vite no app
pnpm check:file-lines         # max 500 LOC por arquivo
pnpm check:main-size          # main process <3000 LOC, ≤300/arquivo
pnpm check:circular           # madge — zero ciclos
pnpm check:cruiser            # dependency-cruiser — fronteiras
pnpm check:dead-code          # knip
pnpm check:unused-deps        # knip --dependencies
pnpm check:exports            # @arethetypeswrong/cli nos pacotes públicos
```

Todos esses rodam em CI (`.github/workflows/ci.yml`) e bloqueiam merge quando falham — inclusive para tech lead.

## 7. Troubleshooting

### "Boot bloqueado para desktop build/dev" no `pnpm dev`

O Vite está validando o contrato do Supabase e não achou as variáveis. Confira:

- Você copiou `.env.example` para `.env`?
- As chaves estão preenchidas com valores reais?
- `cat .env` — alguma linha com `SUPABASE_URL=https://…` e `SUPABASE_ANON_KEY=…`?

Mensagem completa lista os campos faltantes e o caminho dos arquivos carregados.

### Electron abre mas janela fica em branco

Normalmente é o preload não resolvido. Confira se `apps/desktop/out/preload/preload.cjs` existe após `build`. Em `dev`, o electron-vite gera o preload on-the-fly; se ele não está gerando, apague `apps/desktop/out/` e rode de novo.

### Login em loop (histórico; corrigido)

A V2 até **2026-04-21** tinha um loop de redirect no login por três guards independentes chamando `getMe` com timeout agressivo. Se você está vendo esse comportamento em uma branch antiga, rebase sobre `main` — o fix está em [`apps/desktop/src/renderer/auth/auth-store.ts`](../apps/desktop/src/renderer/auth/auth-store.ts) e no task epic `10b-wiring`.

### `pnpm` reclama de peer dep `electron-vite` vs `vite`

Warning conhecido — `electron-vite@5` ainda declara peer `vite@^7`, mas `vite@8` funciona na prática. Sem impacto em dev; já rastreado para ajuste quando `electron-vite@6` sair.

### Node não é 24

```bash
# .nvmrc=24; se estiver usando nvm/fnm:
nvm use
# ou:
fnm use
```

Se mesmo assim pnpm reclamar, adicione `use-node-version=24.10.0` em `~/.npmrc`.

## 8. Onde ir a seguir

- Arquitetura de processos: [`docs/PROCESS-ARCHITECTURE.md`](PROCESS-ARCHITECTURE.md)
- Padrões TypeScript: [`docs/typescript-strictness.md`](typescript-strictness.md)
- Conventional Commits: [`docs/commits.md`](commits.md)
- ADRs aceitos: [`docs/adrs/`](adrs/)
- Roadmap de tasks técnicas: [`G4OS/STUDY/Audit/Tasks/`](../../G4OS/STUDY/Audit/Tasks/)
