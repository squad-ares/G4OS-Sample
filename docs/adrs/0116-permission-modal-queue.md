# ADR 0116: Permission modal — fila não-bloqueante, atalhos de teclado e escopos

## Metadata

- **Numero:** 0116
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Permissões de ferramenta na v1 usavam `window.confirm` ou um modal custom bloqueante. Dois sintomas:

- Quando o agent disparava múltiplas tool calls em paralelo, apareciam N modais empilhados sem ordenação; o usuário clicava em um e os outros sumiam sem decisão registrada.
- Decisões não tinham escopo — "permitir uma vez" era indistinguível de "sempre permitir", forçando o usuário a re-clicar para cada invocação na mesma sessão.

A ADR-0077 já definiu o backend da permission policy (três modos: always-allow / always-deny / ask, com remember-store). TASK-11-00-06 fecha o lado UX: fila visual, atalhos de teclado, escopo por decisão.

## Opções consideradas

### Opção A: Modal bloqueante com Promise unitária

**Descrição:** cada `requestPermission()` devolve uma Promise; o modal trava nova request até resolver a atual.

**Pros:**
- Simples. O caller faz `await requestPermission(...)`.

**Contras:**
- Se N tool calls pedem permissão ao mesmo tempo, a UX vira um desfile de modais.
- Cancelar uma tool exige cancelar todas as Promises pendentes — boilerplate no caller.

### Opção B: Provider + fila interna + modal expõe "próximas N"

**Descrição:** `PermissionProvider` encapsula uma fila. `requestPermission(req)` adiciona à fila e devolve Promise. O modal renderiza a primeira da fila; mostra "X mais na fila" como indicador. Decisão resolve a primeira Promise e avança.

**Pros:**
- UX consistente — um único modal, lista de pendentes visível.
- Atalhos de teclado (`A` = allow, `D` = deny) ganham escopo claro (sempre a primeira da fila).
- Escopos de decisão (`allowOnce`, `allowSession`, `alwaysAllow`, `deny`) ficam nos botões — o usuário escolhe explicitamente.

**Contras:**
- Singleton de estado no Provider — mais overhead de arquitetura que Promise solta.
- Obriga o caller a estar debaixo do Provider na árvore React.

## Decisão

Optamos pela **Opção B** (Provider + fila).

Contrato:

```ts
type PermissionScope = 'once' | 'session' | 'forever';
type PermissionDecision =
  | { outcome: 'allow'; scope: PermissionScope }
  | { outcome: 'deny' };

interface PermissionRequest {
  readonly id: string;
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly description?: string;
}

function requestPermission(req: PermissionRequest): Promise<PermissionDecision>;
```

- Quatro botões: `Deny` (D), `Allow once`, `Allow session`, `Always allow` (A shortcut cobre "Allow once" por ser o caminho mais comum).
- Atalhos `D`/`A` usam `chat.permission.shortcutDeny` / `chat.permission.shortcutAllow` como chaves i18n — pt-BR usa `N`/`P`, en-US usa `D`/`A`.
- "X mais na fila" usa `chat.permission.moreQueued` com `{{count}}` interpolation (renderizado via `t(key, {count})` no `useTranslate`).
- Decisão `allow + session` é registrada num store scoped pela sessão (consumido pela mode-manager do ADR-0077); `forever` registra no store persistente; `once` não registra.

## Consequências

### Positivas

- Tool calls paralelas não disparam múltiplos modais — a fila serializa.
- Escopo explícito nos botões elimina a ambiguidade da v1.
- Atalhos de teclado aceleram o caminho comum (90% dos casos são "allow once").
- `PermissionProvider` é o único que conhece a fila — o caller apenas `await`a.
- `requestPermission` é Result-like via Promise: o caller sempre recebe decisão (não lança em cancel — cancel da request vira `deny`).

### Negativas / Trade-offs

- Obriga um `<PermissionProvider>` na árvore do renderer. Aceitável — já é padrão para auth/theme/platform providers.
- Com fila, o usuário pode ver tool call X antes de tool call Y mesmo que Y tenha chegado antes (ordem de inserção, FIFO). Documentado no i18n da queue.

### Neutras

- O modal é um Radix Dialog — herda escape/focus-trap/portal nativos.
- `description` é opcional e aceita markdown — renderizado via `MarkdownRenderer` do ADR-0115.

## Estrutura implementada

```
packages/features/src/chat/permissions/
├── permission-provider.tsx    # Context + fila + requestPermission
├── permission-modal.tsx       # Radix Dialog + 4 botões + atalhos
├── types.ts                   # PermissionRequest, PermissionDecision, PermissionScope
└── index.ts                   # barrel
```

i18n: `chat.permission.title`, `chat.permission.description`, `chat.permission.deny`, `chat.permission.allowOnce`, `chat.permission.allowSession`, `chat.permission.alwaysAllow`, `chat.permission.moreQueued`, `chat.permission.shortcutDeny`, `chat.permission.shortcutAllow`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤200 LOC.
- Gate `check:i18n`: zero strings hardcoded.
- Smoke manual: tool calls paralelas serializam corretamente; atalhos funcionam; escape fecha só o atual (rejeita como `deny`).

## Referências

- TASK-11-00-06
- ADR-0077 (permission system — três modos + remember store + queue não-bloqueante)
- ADR-0103 (Radix Dialog)
- ADR-0110 (action registry + baseline de teclado)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-06 entregue).
