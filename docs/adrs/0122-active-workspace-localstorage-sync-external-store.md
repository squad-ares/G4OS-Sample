# ADR 0122: Active workspace — localStorage via useSyncExternalStore

## Metadata

- **Numero:** 0122
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 mantinha o workspace ativo como parte do config global serializado em JSON e sincronizado via IPC a cada troca. Isso criava:

- Latência visível: trocar de workspace disparava round-trip IPC + re-render do shell
- Janela única implícita: o config global não suportava "workspace A em janela 1, workspace B em janela 2"
- Acoplamento de estado de UI (qual workspace está ativo) a persistência de aplicação (config.json)

O Epic 11-02 precisa de:
1. Troca instantânea de workspace (sem IPC) para navegação fluida
2. Isolamento por janela para suportar multi-window (TASK-11-02-04)
3. Sem race conditions quando o componente monta antes do IPC responder

## Opções consideradas

### Opção A: Jotai atom global com persistência IPC

**Descrição:** Atom Jotai `activeWorkspaceAtom` que, ao ser setado, dispara mutação IPC para salvar o estado no main process.

**Pros:**
- Consistente com outros estados Jotai do renderer
- IPC como fonte de verdade única

**Contras:**
- Latência perceptível (IPC round-trip ~5ms) a cada troca
- Janela 1 setando o atom sobrescreveria o estado da janela 2 (estado global compartilhado via main)
- Ao reabrir uma janela, o atom não teria valor até o IPC responder — flash de estado vazio

**Custo de implementação:** Médio; necessita de atom persistido + subscriber IPC + hidratação no mount.

### Opção B: TanStack Query + mutation IPC

**Descrição:** `useQuery` para ler o workspace ativo e `useMutation` para alterar, com invalidação de cache.

**Pros:**
- Consistente com o padrão de data-fetching existente
- Devtools integrado

**Contras:**
- Overhead de uma cache key para um valor simples de UI
- Mesmo problema de latência e isolamento por janela da Opção A
- Semanticamente errado: workspace ativo é estado local do renderer, não dado do servidor

**Custo de implementação:** Baixo; mas semanticamente inadequado.

### Opção C: localStorage + useSyncExternalStore

**Descrição:** `localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)` como store externo. `useSyncExternalStore` lê e o `setActiveWorkspaceId` escreve diretamente no localStorage. Multi-window usa URL param `?workspaceId=xxx` para inicializar o localStorage antes do mount (ver ADR-0124).

**Pros:**
- Leitura zero-latência: localStorage é síncrono
- Isolamento por janela: cada janela tem seu próprio contexto de localStorage (Electron cria contexto por BrowserWindow com `partition`)
- Sem IPC para troca de workspace: operação local pura
- `useSyncExternalStore` é o padrão React para integrar com stores externos, garantindo consistência no modo concurrent

**Contras:**
- localStorage não é reativo entre janelas do mesmo renderer sem `storage` event listener
- Limite de 5MB do localStorage (irrelevante para um UUID)
- Sem persistência no main process: se o main quiser saber o workspace ativo de uma janela, precisa consultar via IPC de volta

**Custo de implementação:** Baixo; ~50 LOC de store + hook.

## Decisão

Optamos pela **Opção C** (localStorage + `useSyncExternalStore`).

Reasoning:

1. Workspace ativo é **estado local de UI por janela**, não estado de servidor. Usar IPC para isso inverte a hierarquia de responsabilidades.
2. Isolamento por janela é gratuito: cada `BrowserWindow` tem seu próprio storage context em Electron. Para multi-window funcionar corretamente (ADR-0124), cada janela precisa de estado independente.
3. `useSyncExternalStore` é o hook React oficial para stores externos; comportamento correto no modo concurrent sem `tearing`.
4. A latência zero de localStorage é o critério principal para troca de workspace ser percebida como instantânea.

## Consequências

### Positivas

- Troca de workspace é percebida como instantânea (sem IPC round-trip)
- Cada janela Electron pode ter workspaces diferentes ativos simultaneamente
- Estado sobrevive a recarregamento do renderer (localStorage persiste)
- Código simples: `useActiveWorkspaceId` e `useSetActiveWorkspaceId` são < 20 LOC cada

### Negativas / Trade-offs

- Main process não sabe qual workspace está ativo em cada janela sem uma consulta IPC reversa (edge case: diagnóstico de crash, não é blocker)
- Se o localStorage for limpo (DevTools > Application > Clear), o workspace ativo é perdido — comportamento aceitável (volta para nenhum workspace selecionado)

### Neutras

- `ACTIVE_WORKSPACE_STORAGE_KEY = 'g4os.active-workspace-id'` é exportado para que a leitura em `main.tsx` (boot URL param) use a mesma chave

## Estrutura implementada

```
packages/features/src/workspaces/
└── state/
    └── active-workspace.ts   # store + useActiveWorkspaceId + useSetActiveWorkspaceId

apps/desktop/src/renderer/
└── main.tsx                  # lê ?workspaceId no boot e escreve em localStorage antes do mount
```

Implementação do store:

```ts
export const ACTIVE_WORKSPACE_STORAGE_KEY = 'g4os.active-workspace-id';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot() {
  return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function useActiveWorkspaceId() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
```

## Validação

- `check:cruiser`: `state/active-workspace.ts` não importa `electron` nem `main/`
- Smoke multi-window: janela 1 em workspace A, janela 2 em workspace B — trocar em 1 não afeta 2
- Smoke recarregamento: fechar e reabrir a janela mantém o workspace ativo

## Referencias

- TASK-11-02-02 (`STUDY/Audit/Tasks/11-features/02-workspaces/TASK-11-02-02-workspace-switcher.md`)
- ADR-0121: Persistência híbrida SQLite + filesystem
- ADR-0124: Multi-window workspace isolation via URL param

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-02-02 entregue)
