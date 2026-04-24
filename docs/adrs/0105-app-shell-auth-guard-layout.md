# ADR 0105: App Shell + Auth Guard — layout autenticado e bootstrap do SessionRefresher

## Metadata

- **Numero:** 0105
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Após autenticação bem-sucedida, o usuário precisa de um App Shell: layout com sidebar de workspaces, header com ações globais e área de conteúdo onde as features do épico 11 renderizam.

V1 tinha `AppShell.tsx` com 1.800 LOC misturando layout, lógica de auth, inicialização de serviços e efeitos colaterais. Qualquer mudança em uma parte afetava as outras.

Três decisões não-óbvias motivam este ADR:

1. **Onde inicializar `SessionRefresher`**: deve ser singleton no escopo da área autenticada, não global.
2. **Como centralizar o redirect `reauth_required`**: múltiplos componentes não devem cada um redirecionar para `/login`.
3. **Boundary entre layout e features**: sidebar e header devem ser agnósticos de qual feature está renderizando.

## Opções consideradas

### Opção A: Auth guard na rota _app.tsx + AppShell como layout puro
**Descrição:** A rota `_app.tsx` (TanStack Router layout route) centraliza:
- `beforeLoad`: verifica token; redireciona para `/login` se ausente
- `onError`: captura `reauth_required` e redireciona para `/login`
- `component`: renderiza `AppShell` (sidebar + header + `<Outlet />`)

`SessionRefresher` inicializado em `useEffect` dentro de `_app.tsx` — garante que só existe quando o usuário está autenticado. Cleanup automático no unmount (quando usuário desloga).

**Pros:**
- Guard e layout co-locados na rota que os define
- `SessionRefresher` tem lifecycle atado à rota autenticada
- Redirect `reauth_required` em um único lugar
- `AppShell` sem lógica de auth — apenas composição visual

**Contras:**
- `beforeLoad` assíncrono pode adicionar latência perceptível no primeiro render
- `useEffect` para `SessionRefresher` requer atenção ao StrictMode double-mount

**Custo de implementacao:** M (2 dias)

### Opcao B: HOC `withAuth` em cada rota protegida
**Descricao:** Cada rota protegida wrappa seu componente com `withAuth(Component)`.

**Pros:**
- Flexibilidade por rota

**Contras:**
- Guard duplicado em cada rota — omissão em uma rota = buraco de segurança
- `SessionRefresher` não tem lugar óbvio de inicialização

**Custo de implementação:** M

### Opção C: Guard em `main.tsx` antes do router
**Descrição:** Verificação de auth antes de montar o router.

**Pros:**
- Mais simples conceptualmente

**Contras:**
- Impossível ter rotas públicas (ex: `/login`) sem auth — contradição
- Não funciona com TanStack Router

**Custo de implementação:** S

## Decisão

**Opção A**. TanStack Router foi escolhido precisamente para que guards sejam declarativos por rota. `_app.tsx` como layout route é o padrão canônico do framework para auth guard. `SessionRefresher` como singleton no escopo da rota autenticada é o modelo correto: sem usuário autenticado, não há token para renovar.

Arquitetura do `AppShell`:

```
_app.tsx (guard + SessionRefresher init)
└── AppShell
    ├── WorkspaceSidebar     # lista workspaces, workspace ativo
    ├── ShellHeader          # ações globais, user menu
    └── <Outlet />           # área de conteúdo (épico 11)
```

`ShellNavigator` (ADR-0101a) mapeia entradas de navegação para rotas TanStack — `AppShell` não conhece estrutura de rotas filhas.

## Consequências

### Positivas
- Guard centralizado: adicionar rota autenticada = criar arquivo em `_app/`, não adicionar HOC
- `SessionRefresher` garantidamente inicializado antes de qualquer feature renderizar
- `reauth_required` propagado via TanStack Router error boundary — não chega ao usuário como tela branca

### Negativas / Trade-offs
- `beforeLoad` assíncrono em `_app.tsx` adiciona uma round-trip tRPC no cold start autenticado
- StrictMode double-mount de `SessionRefresher` requer guard via `useRef`

### Neutras
- `AppShell` é componente puro de composição — testável com `<MemoryRouter>` + mock de context

## Validação

- Acessar rota autenticada sem token redireciona para `/login`
- `reauth_required` do `SessionRefresher` redireciona para `/login` sem tela branca
- `AppShell` renderiza corretamente com sidebar + header em todas as rotas de `_app/`

## Referencias

- TASK-10-08: App Shell + Auth Guard
- TASK-09-04: SessionRefresher (ADR-0094)
- ADR-0106: TanStack Router
- ADR-0101a: Matriz de navegação do shell autenticado
- `apps/desktop/src/renderer/routes/_app.tsx`

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-08)
