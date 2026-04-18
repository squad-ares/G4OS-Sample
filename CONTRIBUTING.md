# Contribuindo para G4 OS

Obrigado por querer contribuir! Este documento explica como trabalhar neste monorepo.

## Setup inicial

```bash
# 1. Clone o repositório
git clone <repo> g4os-v2
cd g4os-v2

# 2. Instale dependências
pnpm install

# 3. Configure git hooks
pnpm prepare  # auto-rodado após pnpm install via script prepare

# 4. Inicie o dev mode
pnpm dev      # Abre Electron + watch files
```

### Verificar setup

```bash
pnpm typecheck  # Deve passar
pnpm lint       # Biome deve passar
pnpm build      # Turbo cache deve funcionar
```

## Workflow de mudanças

### 1. Crie uma branch

```bash
git checkout -b feat/sua-feature
# ou
git checkout -b fix/seu-bugfix
```

Use o prefixo indicado:
- `feat/` — nova funcionalidade
- `fix/` — bugfix
- `refactor/` — refatoração sem mudança de behavior
- `docs/` — documentação / ADRs
- `test/` — testes
- `ci/` — CI/CD, build scripts

### 2. Faça suas mudanças

Ao editar código:

```bash
# Enquanto desenvolve, watch mode:
pnpm dev --parallel

# Antes de commitar, rode os gates locais:
pnpm typecheck    # TypeScript
pnpm lint         # Biome
pnpm build        # Turbo (cacheado após build)
pnpm test         # Vitest

# Opcional: CI gates completos localmente
pnpm check:file-lines     # Max 500 linhas/arquivo
pnpm check:circular       # Sem ciclos
pnpm check:cruiser     # Fronteiras respeitadas
pnpm check:dead-code      # Sem exports mortos
pnpm check:unused-deps    # Sem deps não usadas
```

### 3. Teste sua mudança

#### Unit tests

```bash
cd packages/<seu-pacote>
pnpm test         # Roda testes
pnpm test:watch   # Watch mode
```

Crie testes em `src/__tests__/<nome>.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../your-function';

describe('yourFunction', () => {
  it('should do X', () => {
    expect(yourFunction()).toBe(expected);
  });
});
```

#### E2E tests (Electron)

```bash
cd apps/desktop
pnpm test:e2e     # Playwright-electron
```

### 4. Commit com conventional commits

```bash
# Git hooks (lefthook) vão validar sua mensagem
git add .
git commit -m "feat(remote-control): add revoke pair functionality"
```

Formato obrigatório:
```
<type>(<scope>): <subject>

<body>

<footer>
```

Tipos válidos:
- `feat` — nova funcionalidade
- `fix` — bugfix
- `refactor` — refatoração
- `docs` — documentação
- `test` — testes
- `ci` — build / CI
- `perf` — performance

Exemplo:
```
feat(agents): implement claude-sonnet-4-6 support with 1h cache

Add support for Claude Sonnet 4.6 model with prompt caching at 1 hour TTL.
Includes model equivalence mapping and cache marker optimization.

Fixes #123
```

### 5. Push e crie PR

```bash
git push origin feat/sua-feature
# GitHub CLI:
gh pr create --title "feat: your feature" --body "..."
# ou via web
```

Seu PR description deve incluir:

```markdown
## Resumo
O que essa PR faz (1-2 parágrafos).

## Test Plan
- [ ] Feature X testada em setup Y
- [ ] Caso edge Z não quebra
- [ ] Performance OK (se aplicável)

## Checklist
- [ ] Código segue lint + typecheck
- [ ] Testes adicionados / atualizado
- [ ] ADR escrito (se decisão arquitetural)
- [ ] Documentação atualizada
```

## Padrões de código

### Estrutura de arquivo

Máximo 500 linhas por arquivo:

```typescript
// 1. Imports (absolutas, organizadas)
import { z } from 'zod';
import { someType } from '../types';
import { someUtil } from '../utils';

// 2. Types/Interfaces (públicas primeiro)
export interface IExample {
  name: string;
}

interface InternalState {
  value: number;
}

// 3. Constants
const DEFAULT_VALUE = 100;

// 4. Exported functions/classes
export function example(input: IExample) {
  // ...
}

// 5. Private helpers
function helper() {
  // ...
}
```

### Naming

- Functions/variables: `camelCase`
- Types/Interfaces: `PascalCase`, prefixo `I` para interfaces públicas
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case.ts` (exceto components: `ComponentName.tsx`)

### Error handling

Use `Result<T, E>` para erros esperados, **não exceptions**:

```typescript
import { ok, err, Result } from 'neverthrow';

export async function getData(id: string): Promise<Result<Data, 'not_found'>> {
  const data = await db.get(id);
  if (!data) return err('not_found');
  return ok(data);
}

// Uso:
const result = await getData('123');
if (result.isErr()) {
  logger.warn(`Data not found: ${result.error}`);
  return;
}
const data = result.value;  // typed como Data
```

### TypeScript strictness

Todos esses flags são obrigatórios em `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true
  }
}
```

Nenhum `// @ts-ignore` permitido sem ADR.

### Type exports

Use `export type` para tipos, `export` para valores:

```typescript
export type IUser = { id: string; name: string };
export const createUser = (name: string): IUser => ({ id: uuid(), name });
```

### Logging

Não use `console.log` em produção. Use `pino`:

```typescript
import { logger } from '@g4os/kernel/logger';

logger.info({ userId: id }, 'User created');
logger.warn({ error: err }, 'Failed to fetch data');
logger.error({ cause, attempt }, 'Critical failure');
```

### Lifecycle (Disposable pattern)

Classes com listeners / timers devem implementar `IDisposable`:

```typescript
import { DisposableBase } from '@g4os/kernel/disposable';

export class MyController extends DisposableBase {
  constructor(private session: Session) {
    super();
    // Sempre use this._register para listeners
    this._register(session.onMessage(this.handleMessage));
    this._register(setInterval(() => this.tick(), 1000));
  }

  dispose() {
    // Automático via DisposableBase
    super.dispose();
  }
}
```

## Adicionando uma dependência

```bash
# Workspace root
pnpm add -w lodash            # Runtime dep
pnpm add -w -D typescript     # Dev dep

# Pacote específico
cd packages/kernel
pnpm add zod                  # Adiciona ao package.json local
pnpm add -D vitest --workspace-root  # Dev, resolvido do root
```

**Importante**: Use `pnpm add -w` para deps compartilhadas (não instale em múltiplos pacotes).

## Publicando uma release

G4 OS usa Changesets para versionamento:

```bash
# 1. Crie um changeset
pnpm changeset

# Responda as perguntas:
# - Qual pacote mudou? (multi-select)
# - Major/minor/patch?
# - Descrição (usada em changelog)

# 2. Commit do changeset
git add .changeset/
git commit -m "chore: add changeset"

# 3. Na main, após merge:
pnpm changeset:version   # Atualiza versions + CHANGELOG.md
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main --tags

# 4. Publicar (se publicável)
pnpm changeset:publish
```

## Estrutura de PR por tipo

### Feature nova

```
packages/features/feature-foo/
├── src/
│   ├── index.ts           # Exports públicas
│   ├── foo-controller.ts  # Lógica principal (<400 LOC)
│   ├── foo-ui.tsx         # React components
│   └── __tests__/         # Testes
├── package.json
├── tsconfig.json
└── README.md              # O que faz, exemplo de uso
```

### Agent backend novo

```
packages/agents/agent-bar/
├── src/
│   ├── index.ts
│   ├── bar-agent.ts       # Implementa IAgent
│   ├── bar-client.ts      # Comunicação com bar
│   └── __tests__/
├── package.json
└── README.md
```

### Integração MCP

```
packages/sources/source-baz/
├── src/
│   ├── index.ts
│   ├── baz-source.ts      # Implementa ISource
│   ├── baz-oauth.ts       # Auth flow
│   └── __tests__/
└── README.md
```

## ADRs (Decisões Arquiteturais)

Toda decisão de arquitetura > 1 dia de trabalho deve ter um ADR:

```bash
pnpm adr:new "Use Durable Objects para remote control"
# Cria: docs/adrs/0001-use-durable-objects-for-remote-control.md
```

Formato:

```markdown
# ADR NNNN: Decisão

## Status
Accepted / Proposed / Deprecated

## Context
Por que estamos tomando essa decisão?

## Decision
O que decidimos fazer?

## Consequences
Quais são as consequências (positivas e negativas)?

## Alternatives Considered
- Alternativa 1: prós e contras
- Alternativa 2: prós e contras

## Related
- Links para issues, PRs anteriores
```

## Troubleshooting

### Build falha com "file not found"

```bash
# Limpe cache do Turbo
pnpm clean
pnpm install
pnpm build
```

### TypeScript errors después de merge

```bash
# Reconstrua tipos
pnpm typecheck --force
```

### pnpm install falha com módulos nativos

```bash
# Verifique a versão do Node
node --version  # Deve ser >= 20.10.0

# Limpe node_modules
pnpm store prune
rm -rf node_modules
pnpm install
```

### Electron não inicia em dev

```bash
# Verifique a porta 5173 (Vite renderer)
lsof -i :5173

# Ou matei algum processo:
pnpm dev --no-cache
```

## CI Gates (deve passar antes de merge)

```
✓ lint (Biome)
✓ typecheck (tsc)
✓ unit tests (vitest)
✓ architecture gates (max-lines, boundaries, circular, dead-code)
✓ build (all packages)
✓ contract tests (tRPC)
✓ integration tests
✓ E2E (Playwright-electron matrix: mac/win/linux)
```

Memory tests rodam nightly apenas.

## Contato e Help

- **Questions**: Abra uma Issue com tag `question`
- **Bug reports**: Issue com tag `bug`
- **Feature requests**: Issue com tag `enhancement`
- **Security**: sr.igor.dev@gmail.com (confidencial)

Bem-vindo! 🚀
