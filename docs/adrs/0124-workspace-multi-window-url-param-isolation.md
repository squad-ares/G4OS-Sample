# ADR 0124: Multi-window workspace — isolamento por URL param

## Metadata

- **Numero:** 0124
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 suportava apenas uma janela principal. O estado ativo (workspace, sessão aberta) era global ao processo renderer. Abrir uma segunda janela resultava em inconsistência de estado: ambas as janelas compartilhavam o mesmo localStorage e, portanto, exibiam sempre o mesmo workspace ativo.

O Epic 11-02 (TASK-11-02-04) precisa que o usuário possa abrir múltiplos workspaces simultaneamente em janelas independentes, sem que a ação em uma janela afete o estado da outra.

## Opções consideradas

### Opção A: IPC broadcast — main process como árbitro

**Descrição:** Quando uma janela abre um workspace, ela notifica o main process. O main mantém um mapa `windowId → workspaceId`. Cada janela lê seu workspace ativo via IPC query.

**Pros:**
- Main process tem visibilidade completa de qual janela exibe qual workspace
- Permite features futuras como "enviar mensagem para janela do workspace X"

**Contras:**
- Toda leitura de workspace ativo exige round-trip IPC
- Boot da janela exige IPC antes do primeiro render (flash de conteúdo)
- Acoplamento: state de UI (qual workspace está ativo) vai para o main process

**Custo de implementação:** Alto; novo canal IPC, novo estado no main, hidratação no mount.

### Opção B: Electron `partition` por workspace — localStorage separado por default

**Descrição:** Cada janela de workspace usa uma partition Electron diferente (`persist:workspace-<id>`), criando localStorage e cookies isolados por default.

**Pros:**
- Isolamento total de storage sem código extra no renderer
- Cada partition pode ter cookies e IndexedDB separados

**Contras:**
- Cada partition carrega um processo renderer independente na memória
- Não é possível compartilhar TanStack Query cache ou Jotai store entre janelas do mesmo workspace
- Complexidade na criação de janelas: `partition` é imutável, precisaria de lógica no `WindowManager`

**Custo de implementação:** Médio-alto; requer nova arquitetura de WindowManager e revisão do modelo de memória.

### Opção C: URL param `?workspaceId=xxx` — localStorage inicializado no boot

**Descrição:** Ao abrir uma janela para um workspace específico, o `WindowManager` carrega a URL do renderer com `?workspaceId=<id>`. O `main.tsx` do renderer lê esse param ao montar e escreve `localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)` **antes** de renderizar qualquer componente React.

Cada `BrowserWindow` tem seu próprio contexto de localStorage em Electron por default (sem partition adicional). Portanto, janela 1 e janela 2 já possuem storages separados.

**Pros:**
- Nenhum IPC necessário para leitura de workspace ativo
- Boot instantâneo: localStorage é síncrono, não há flash
- Compatível com ADR-0122 (active workspace via `useSyncExternalStore + localStorage`)
- Zero mudança no `WindowManager` para multi-window; só adiciona `?workspaceId=xxx` na URL

**Contras:**
- O URL param fica visível no histórico do renderer (inócuo em Electron, mas estético)
- Se o usuário alterar manualmente a URL do renderer, poderia passar um ID inválido — tratado com fallback para `null` na store

**Custo de implementação:** Muito baixo; ~10 LOC em `main.tsx` + modificação simples no `WindowManager`.

## Decisão

Optamos pela **Opção C** (URL param + localStorage no boot).

Reasoning:

1. Cada `BrowserWindow` do Electron já tem localStorage isolado por default — não há vazamento entre janelas sem nenhuma configuração adicional.
2. A consistência com ADR-0122 é fundamental: o mesmo hook `useActiveWorkspaceId` funciona sem modificação em qualquer janela.
3. A complexidade incremental é mínima: `appendWorkspaceId(url, workspaceId)` no `WindowManager` e 3 linhas em `main.tsx`.
4. A Opção A (IPC broadcast) é over-engineering para um estado puramente local de UI.

## Consequências

### Positivas

- Janela 1 com workspace A e janela 2 com workspace B funcionam completamente independentes
- TanStack Query cache e Jotai atoms são por-janela por default (sem partition extra)
- `WindowManager.openForWorkspace(workspaceId)` reutiliza janela existente se já houver uma com o mesmo workspace (evita janelas duplicadas)
- Bounds da janela são persistidos por `workspaceId` via IPC ao fechar

### Negativas / Trade-offs

- Main process não sabe qual workspace está ativo em cada janela sem uma chamada IPC de retorno (edge case de diagnóstico)
- Não há comunicação reativa entre janelas: se workspace A for renomeado na janela 1, a janela 2 precisará de invalidação manual (via TanStack Query `invalidate` em evento IPC)

### Neutras

- A URL param é lida uma vez no boot e descartada; o estado vivo é o localStorage

## Estrutura implementada

```ts
// apps/desktop/src/main/window-manager.ts
export function openForWorkspace(workspaceId: string, overrides?: BrowserWindowConstructorOptions) {
  const existing = this.windowsByWorkspace.get(workspaceId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }
  const url = appendWorkspaceId(this.defaultRendererUrl, workspaceId);
  const win = this.createWindow(url, overrides);
  this.windowsByWorkspace.set(workspaceId, win);
  return win;
}

function appendWorkspaceId(baseUrl: string, workspaceId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('workspaceId', workspaceId);
  return url.toString();
}
```

```ts
// apps/desktop/src/renderer/main.tsx (boot, antes do render)
const params = new URLSearchParams(window.location.search);
const workspaceId = params.get('workspaceId');
if (workspaceId) {
  localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
}
```

## Validação

- Smoke: abrir workspace A, depois "Abrir em nova janela" no workspace B — ambas as janelas exibem workspaces diferentes
- Smoke: fechar janela do workspace B e reabrir via `openForWorkspace` — bounds restaurados
- Smoke: renomear workspace A na janela 1 — janela 2 exibe nome atualizado após invalidação da query

## Referencias

- TASK-11-02-04 (`STUDY/Audit/Tasks/11-features/02-workspaces/TASK-11-02-04-multi-window.md`)
- ADR-0122: Active workspace via localStorage + useSyncExternalStore
- ADR-0100: WindowManager com estado persistido (base do multi-window)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-02-04 entregue)
