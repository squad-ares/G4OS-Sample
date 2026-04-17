# G4 OS — Multi-session AI agent desktop app

G4 OS é uma aplicação desktop (Electron) para gerenciar múltiplas sessões de chat com agentes de IA (Claude, Codex, Pi) com suporte a integração com ferramentas externas via MCP (Model Context Protocol), marketplace de skills, automação de workflows, e colaboração multiplayer.

## Características

- **Multi-sessão**: Abra múltiplos chats simultâneos, cada um rodando em seu próprio worker process isolado
- **Múltiplos provedores de IA**: Claude (nativo), Codex (OpenAI-compatible), Pi (Gemini/OpenAI), Bedrock (AWS)
- **Integração MCP**: Suporte a ferramentas externas (Git, GitHub, Linear, Slack, Gmail, etc.)
- **Marketplace**: Discover e instale skills e workflows da comunidade
- **Automação**: Scheduler (cron) + Vigia (watchers) para automação de tarefas
- **Company Context**: Documentação compartilhada, hierarquia organizacional, PRs, pessoas
- **Remote Control**: Controle sessions de chat via dispositivo móvel
- **Type-safe IPC**: tRPC v11 + Electron para comunicação main ↔ renderer
- **Prompt caching**: Otimização automática para reduzir consumo de tokens

## Quick Start

### Pré-requisitos

- Node.js >= 20.10.0
- pnpm >= 9.0.0
- macOS 12+ / Windows 10+ / Linux (Ubuntu 20.04+)

### Setup local

```bash
# Clone e instale dependências
git clone <repo> g4os-v2
cd g4os-v2
pnpm install

# Development
pnpm dev                    # Inicia Electron app em modo watch
pnpm build                  # Build todos os pacotes
pnpm typecheck              # Typecheck TypeScript
pnpm lint                   # Lint com Biome
pnpm test                   # Roda testes

# CI gates locais (recomendado antes de PR)
pnpm check:file-lines       # Max 500 linhas por arquivo
pnpm check:circular         # Detecta ciclos
pnpm check:boundaries       # Valida fronteiras entre pacotes
pnpm check:dead-code        # Encontra exports não usados
pnpm check:unused-deps      # Encontra deps não usadas
```

## Estrutura do Monorepo

```
g4os-v2/
├── apps/
│   ├── desktop/            # Electron main + renderer (React)
│   └── viewer/             # Web viewer para share links
├── packages/
│   ├── kernel/             # Tipos base, errors, result types
│   ├── platform/           # Abstração de SO (paths, keychain, spawn)
│   ├── ipc/                # tRPC router + procedures
│   ├── credentials/        # Vault gateway (safeStorage)
│   ├── agents/             # Claude, Codex, Pi agent impls
│   ├── sources/            # MCP, managed connectors
│   ├── features/           # Feature-Sliced Design modules
│   └── ui/                 # React components compartilhados
├── docs/
│   └── adrs/               # Architecture Decision Records
├── scripts/                # Build, CI, utilities
├── tsconfig.base.json      # TypeScript config base
├── turbo.json              # Turborepo config
├── pnpm-workspace.yaml     # pnpm workspaces
└── biome.json              # Biome linter + formatter
```

## Tecnologia Stack

| Layer | Escolha | Por que |
|-------|---------|--------|
| **Runtime** | Electron 41+ | Desktop native, isolamento de processos |
| **Bundler** | Vite (renderer), esbuild (main/preload) | HMR rápido, builds determinísticos |
| **Package manager** | pnpm 9+ | Hoisting determinístico para módulos nativos |
| **Task runner** | Turborepo | Cache remoto, paralelismo, integrado com pnpm |
| **Language** | TypeScript 5.7+ strict | Type-safety absoluto, `noImplicitAny`, `exactOptionalPropertyTypes` |
| **Linter** | Biome | 10x mais rápido que ESLint, config única |
| **State (server)** | TanStack Query | Cache, invalidação, GC automático |
| **State (client)** | Jotai | Granular, atom pattern, sem re-renders desnecessários |
| **Routing** | TanStack Router | Type-safe, file-based, melhor que React Router |
| **Forms** | React Hook Form + Zod | Padrão, performance, validação runtime |
| **Database** | better-sqlite3 + drizzle-orm | Sync nativo, SQL type-safe, zero WASM |
| **IPC** | tRPC v11 + electron-trpc | Type-safe end-to-end, zero codegen |
| **Credentials** | Electron safeStorage | Keychain nativo (macOS/Windows/Linux) |
| **Logging** | pino | Estruturado JSON, rápido, não bloqueia event loop |
| **Testing** | Vitest + Playwright | Compatível com Vite, E2E em Electron real |
| **Crash reports** | Sentry + Electron crashReporter | JS + native crashes |
| **Observabilidade** | OpenTelemetry | Tracing distribuído (main → worker → MCP) |

## Princípios de Arquitetura

### 1. Processos isolados (resolve memory leaks)
- **Main** thin (<2000 linhas): window lifecycle, IPC router, supervisão
- **Workers**: Session, Agent, MCP cada um isolado via `utility-process`
- Sessão travou? Kill só o worker, app continua

### 2. Fronteiras explícitas de pacotes
- eslint-plugin-boundaries: feature-chat NÃO pode importar de feature-projects
- dependency-cruiser: renderer NÃO acessa main, só via tRPC
- madge: detecção de ciclos em CI

### 3. Type-safety absoluto
- `strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Nenhum `any` permitido
- Erros esperados = `Result<T, E>` (neverthrow), não exceptions

### 4. Arquivos pequenos (<500 linhas)
- IA consegue entender contexto completo
- Testes como spec, nomes explícitos

### 5. Sem console.log em produção
- Biome rule custom mata `console.*`
- Logging via pino estruturado

## Desenvolvimento

### Adição de nova feature

1. Crie pacote em `packages/features/<nome>/`
2. Declare em `packages/features/<nome>/package.json`
3. Implemente feature logic + React components
4. Adicione session tool em `packages/ipc/procedures/`
5. Adicione testes em `src/__tests__/`
6. Crie ADR explicando decisões

### Adição de novo provider de IA

1. Implemente `IAgent` em `packages/agents/agent-<provedor>/`
2. Registre no agent factory
3. Adicione model equivalence em `model-equivalence.ts`
4. Teste caching de prompts + token counting

### Integração de nova fonte MCP

1. Scaffold em `packages/sources/source-<nome>/`
2. Implemente interface `ISource`
3. Registre em sources registry
4. Teste auth flow (OAuth / API key / stdio)

## Contribuindo

Leia [CONTRIBUTING.md](./CONTRIBUTING.md) para:
- Setup detalhado
- Workflow de PR
- Guia de testes
- CI gates que precisam passar

## Recursos

- **ADRs**: [docs/adrs/](./docs/adrs/) — decisões de arquitetura com contexto
- **API Docs**: Gerados via JSDoc + TypeScript (package-level `API.md`)
- **CLAUDE.md**: Context para AI agents (CI gates, patterns, tool usage)

## License

Proprietário (confidencial)

