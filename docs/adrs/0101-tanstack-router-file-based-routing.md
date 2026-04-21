# ADR 0101: TanStack Router — roteamento file-based type-safe no renderer

## Metadata

- **Numero:** 0101
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

V1 usava roteamento custom (combinação de estado Jotai + renderização condicional) sem URL real, sem type safety em params, sem guard declarativo de auth. Deep links eram impossíveis; navegar para uma sessão específica exigia reconstituir estado imperativo.

V2 precisa de:
- URLs tipadas para workspaces, sessions e projetos
- Guard de auth declarativo (redireciona `/login` se não autenticado)
- Deep links funcionais via Electron custom scheme
- Params e search params validados por Zod

## Opções consideradas

### Opção A: TanStack Router (file-based, type-safe)
**Descrição:** `@tanstack/react-router` com plugin Vite para geração automática de tipos a partir da estrutura de arquivos em `routes/`.

**Pros:**
- Type safety end-to-end em params e search (gerado por codegen)
- File-based routing integra com Vite HMR sem config manual
- Guard via `beforeLoad` na rota `_app.tsx` (layout autenticado)
- Validação de params com Zod schema nativo

**Contras:**
- Beta no momento da adoção; agora estável (1.x)
- Plugin Vite adiciona ~200ms ao cold start de dev

**Custo de implementação:** M (2-3 dias)

### Opção B: React Router v7
**Descrição:** React Router com loader pattern, agora com type inference parcial.

**Pros:**
- Mais familiar para devs com background Next.js
- Estável e amplamente adotado

**Contras:**
- Type safety de params requer boilerplate manual ou plugin adicional
- Loader pattern não mapeia bem ao modelo tRPC subscription já adotado

**Custo de implementação:** M

### Opcao C: Roteamento manual (manter V1)
**Descrição:** Continuar com estado Jotai como "router".

**Pros:**
- Zero nova dep

**Contras:**
- Deep links impossíveis
- Impossível fazer auth guard declarativo
- `navigate()` type-unsafe

**Custo de implementação:** XS (mas divida técnica alta)

## Decisão

Optamos pela **Opção A** (TanStack Router). Type safety em params é requisito hard para o design de features do épico 11 (workspaceId, sessionId, projectId como params tipados). O plugin Vite elimina boilerplate de registro de rotas. A rota `_app.tsx` como layout autenticado centraliza o guard sem duplicar lógica por rota.

Estrutura canônica de rotas adotada:

```
apps/desktop/src/renderer/routes/
├── __root.tsx
├── index.tsx
├── login.tsx
├── _app.tsx                                          # guard + layout
└── _app/
    ├── workspaces.index.tsx
    ├── workspaces.$workspaceId.tsx
    ├── workspaces.$workspaceId.sessions.$sessionId.tsx
    ├── workspaces.$workspaceId.projects.index.tsx
    ├── workspaces.$workspaceId.projects.$projectId.tsx
    ├── settings.tsx
    └── marketplace.tsx
```

## Consequências

### Positivas
- Params tipados: `Route.useParams()` retorna `{ workspaceId: string }` sem cast
- Auth guard único em `_app.tsx` protege toda a área autenticada
- Deep links funcionam via Electron custom scheme + `router.navigate()`

### Negativas / Trade-offs
- Geração de tipos (`routeTree.gen.ts`) não pode ser editada manualmente
- Estrutura file-based acopla organização de arquivos ao design de URLs

### Neutras
- `@tanstack/router-vite-plugin` versão fixada junto com `@tanstack/react-router`

## Validação

- `tsc --noEmit` passa sem cast em `useParams()`
- Acessar `/app/workspaces/inexistente` sem auth redireciona para `/login`
- Deep link `g4os://workspace/abc/session/xyz` abre sessão correta

## Referencias

- TASK-10-02: TanStack Router setup
- ADR-0101a: Matriz de navegação do shell autenticado
- `apps/desktop/src/renderer/routes/`

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-02)
