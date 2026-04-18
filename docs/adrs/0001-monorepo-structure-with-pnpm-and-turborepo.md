# ADR 0001: Estrutura de Monorepo com pnpm + Turborepo

## Status

**Accepted**

Data: 2026-04-17
Revisado por: Igor Rezende
Relacionado: TASK-00-01

## Contexto

G4 OS é um projeto complexo que combina:
- Aplicação Electron (desktop)
- Web viewer (React)
- 8+ pacotes internos (agents, sources, features, IPC, credentials, etc.)
- Múltiplos runtimes (main process, workers, Durable Objects)

A v1 tinha estrutura frouxamente acoplada que resultou em:
1. **Hoisting de módulos nativos**: Bun tem bugs conhecidos em módulos nativos (better-sqlite3, electron-rebuild)
2. **Sem isolamento de tasks**: Builds repetiam do zero (CI lento)
3. **Dependências fantasma**: Imports não declarados resolvia via hoisting acidental
4. **Falta de fronteiras**: Qualquer arquivo importava de qualquer outro sem restrictions
5. **Sem versionamento de package**: Versão única não reflete mudanças granulares

**Problema a resolver**: Como estruturar um monorepo que suporte:
- Múltiplos workspaces com dependências bem definidas
- Determinismo absoluto (reprodutibilidade)
- Cache de builds eficiente
- Fronteiras explícitas entre funcionalidades
- Desenvolvimento confortável (DX)
- Scaling: adicionar novo feature/agent sem quebrar nada

## Decision

Adotamos **pnpm workspaces + Turborepo** como standard:

### 1. Package Manager: pnpm

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/features/*'
  - 'packages/agents/*'
```

**Por quê pnpm:**
- **Determinismo**: Hoisting explícito, sem "phantom dependencies"
- **Modelos nativos**: Resolvidos sem bugs (melhor que Bun)
- **Monorepo seguro**: `shamefully-hoist=false` + `strict-peer-dependencies=true` força declaração de deps
- **Versão pinada**: `packageManager: "pnpm@9.12.0"` garante versão única
- **Espaço em disco**: Symlinking eficiente, não duplica packages

**Não escolhemos:**
- **npm**: Hoisting implícito, lento em workspaces
- **yarn**: Melhor, mas pnpm é mais rápido + determinístico
- **Bun**: Bugs reais em módulos nativos (better-sqlite3, electron rebuild), instabilidade

### 2. Task Runner: Turborepo

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Por quê Turborepo:**
- **Cache inteligente**: Segunda execução de `pnpm build` = 16ms (cache hit)
- **Grafo de dependências**: Entende ordem de execução automática
- **Paralelismo**: Roda tarefas independentes em paralelo
- **Remote cache**: Ci/CD compartilha cache com devs (opcional, mas poderoso)

**Não escolhemos:**
- **Lerna**: Desacoplado do package manager, mais overhead
- **Rush**: Mais complexo, aprendizado steep
- **Nx**: Poderoso mas overkill; design opinado

### 3. Estrutura de Pacotes

```
packages/
├── kernel/              # Tipos, errors, utils sem dependências
├── platform/            # Abstração de SO (paths, keychain, spawn)
├── ipc/                 # tRPC router + procedures
├── credentials/         # Vault gateway (safeStorage)
├── agents/              # IAgent implementations (Claude, Codex, Pi)
├── sources/             # MCP stdio, HTTP, managed connectors
├── features/            # Feature-Sliced Design (chat, projects, etc.)
└── ui/                  # React components compartilhados
```

**Regra de dependência:**
```
features/* can depend on: kernel, ipc, ui, platform, credentials
agents/* can depend on: kernel, ipc
sources/* can depend on: kernel, ipc, credentials
ui/* can depend on: kernel
```

Enforçado via `eslint-plugin-boundaries` + `dependency-cruiser`.

### 4. TypeScript Strict Mode

Todas as compilações obrigatoriamente:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

**Consequências:**
- Zero `any` — tudo é type-safe
- Erros esperados = `Result<T, E>` (neverthrow)
- Exceptions só para bugs de programação

### 5. Build Output

Cada pacote gera:
```
dist/
├── index.js           # ESM (padrão)
├── index.cjs          # CommonJS (fallback)
├── index.d.ts         # TypeScript declarations
├── index.d.cts        # CJS declarations
└── *.map              # Source maps
```

Via **tsup** (wrapper sobre esbuild) — rápido, configurável.

## Consequences

### Positivas

1. **Determinismo absoluto**
   - `pnpm install --frozen-lockfile` reproduz exatamente
   - Sem hoisting acidental, sem surpresas

2. **Performance de build**
   - Turbo cache 10-20x mais rápido após primeira build
   - CI reduz de 15min+ para ~5min (com cache remoto)

3. **Escalabilidade**
   - Adicionar novo feature/agent = copiar template, declarar deps
   - Sem risco de quebrar outro pacote

4. **Fronteiras claras**
   - `eslint-plugin-boundaries` bloqueia imports indevidos em build
   - Facilita refatoração sem medo

5. **Developer experience**
   - `pnpm dev` abre Electron em watch mode
   - `pnpm typecheck` roda em paralelo
   - Imports locais resolvem sem build (TS → TS direto)

6. **CI/CD previsível**
   - Gates automatizados (Biome, tsc, vitest, madge, size-limit)
   - Nenhum PR humano pode mergear violando regras

### Negativas

1. **Setup inicial complexo**
   - pnpm + Turborepo + tsup + eslint-plugin-boundaries = mais ferramentas
   - Documentação obrigatória (esse ADR + CONTRIBUTING.md)

2. **Troubleshooting**
   - `pnpm install` falha diferente de npm
   - Módulos nativos exigem Node.js correto
   - `pnpm store prune` nem sempre resolve tudo

3. **Curva de aprendizado**
   - Developers usados a `npm` precisam aprender `pnpm` semantics
   - Workspace rules não são óbvias

4. **Bloat de ferramentas**
   - Biome (linter) + lefthook (git hooks) + Turborepo + pnpm
   - ~20 devDependencies apenas para tooling
   - Controle: cada uma resolve um problema real (sem redundância)

## Alternatives Considered

### 1. Monorepo tradicional (no package manager isolation)
```
g4os/
├── src/
│   ├── agents/
│   ├── sources/
│   └── ...
└── package.json (tudo)
```

**Prós:**
- Setup simples
- Sem ferramentas extra

**Contras:**
- Sem isolamento de features
- Imports cruzados frequentes
- Difícil remover um feature sem quebrar outro
- "Big ball of mud" clássico

**Descartado**: Não suporta crescimento do projeto.

### 2. Yarn workspaces (clássico)
```bash
yarn install  # automaticamente resolve workspaces
```

**Prós:**
- Maduro, documentado

**Contras:**
- Hoisting implícito (mesmo problema que npm)
- Sem remote cache (nativo)
- Mais lento em workspaces grandes

**Descartado**: pnpm é demonstravelmente mais rápido + determinístico.

### 3. Rush (Microsoft)
```bash
rush install  # Gerencia installs de forma centralizada
```

**Prós:**
- Muito rápido, bem otimizado
- Controle total sobre hoisting

**Contras:**
- Aprendizado steep, design prescritivo
- Menos flexível que pnpm
- Comunidade menor

**Descartado**: pnpm + Turborepo resolve o mesmo problema com menos complexity.

### 4. Bun (como package manager)
```bash
bun install
```

**Prós:**
- Rápido, single tool (não precisa de Node.js)
- Moderno

**Contras:**
- **Bugs em módulos nativos documentados** (better-sqlite3, electron)
- Instabilidade (breaking changes entre releases)
- Comunidade emergente, não 100% compatível com npm

**Descartado**: Risco técnico inaceitável para projeto em produção.

## Related Decisions

- **ADR 0002** (futuro): tRPC v11 + electron-trpc para IPC type-safe
- **ADR 0003** (futuro): Arquitetura de processos (main thin, workers isolados)
- **TASK-00-02**: Setup Biome linter
- **TASK-00-03**: Git hooks com lefthook
- **TASK-00-05**: CI gates em GitHub Actions

## Implementation Notes

### Checklist da implementação

- [x] pnpm workspace.yaml criado
- [x] .npmrc com save-exact, engine-strict, strict-peer-dependencies
- [x] Turborepo instalado + turbo.json configurado
- [x] tsconfig.base.json com strict mode absoluto
- [x] Cada pacote tem tsconfig.json que estende base
- [x] eslint-plugin-boundaries instalado (TASK-00-03)
- [x] madge para detecção de ciclos
- [x] dependency-cruiser para validação de layers
- [x] Documentação (README.md, CONTRIBUTING.md, este ADR)

### Próximos passos

1. TASK-00-02: Biome linter + formatter
2. TASK-00-03: lefthook + commitlint
3. TASK-00-04: CI gates GitHub Actions
4. Depois: Implementar cada feature/agent conforme tasks

### Rollback (improvável)

Se pnpm + Turborepo provarem insuficientes:
1. Migrar para npm + lerna (mais simples, menos rápido)
2. Perda de ~30% de performance em CI, mas código fica igual
3. Esforço: ~2-3 dias

Custo esperado: Mínimo. Investimento em pnpm é seguro.

---

**Autores/Revisores:**
- Igor Rezende (decision maker)
- Tech Lead (review)

**Última atualização:** 2026-04-17
