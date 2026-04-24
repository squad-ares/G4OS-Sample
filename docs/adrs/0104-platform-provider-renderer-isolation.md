# ADR 0104: PlatformProvider — isolamento do renderer de APIs Electron

## Metadata

- **Numero:** 0104
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

V1 tinha componentes React que chamavam `window.electronAPI.onReadFileAsDataUrl`, `window.electronAPI.openExternal`, etc. diretamente. Dois problemas:

1. **Acoplamento estrutural**: componentes em `packages/ui` não podiam ser testados ou usados fora do Electron sem stub manual de `window.electronAPI`.
2. **Inconsistência de contrato**: cada chamada ao preload usava string literal diferente, sem type safety central.

ADR-0013 estabelece que `@g4os/platform` é o único ponto de abstração de OS. A mesma lógica se aplica ao renderer: nenhum componente deve conhecer `window.electronAPI` diretamente.

## Opções consideradas

### Opção A: PlatformContext + PlatformProvider via tRPC
**Descrição:** `PlatformContext` expõe ações host-specific (`readFileAsDataUrl`, `openExternal`, `copyToClipboard`, `showSaveDialog`) como funções puras. `PlatformProvider` no renderer implementa essas funções chamando procedures tRPC em `@g4os/ipc`. Componentes usam `usePlatform()` — sem saber que estão em Electron.

**Pros:**
- Componentes de `packages/ui` e `packages/features` são testáveis com mock de context
- Contrato unificado em um único tipo `PlatformContextValue`
- tRPC garante serialização e type safety end-to-end

**Contras:**
- Overhead de tRPC para operações simples (ex: `copyToClipboard`)
- `PlatformProvider` precisa estar na árvore de providers antes de qualquer componente que usa `usePlatform()`

**Custo de implementação:** S (1-2 dias)

### Opção B: Hook useElectronAPI() com type wrapper
**Descrição:** Hook que wrappa `window.electronAPI` com tipos definidos.

**Pros:**
- Mais simples: sem tRPC, sem Context
- Fácil de usar em qualquer componente

**Contras:**
- Ainda acopla ao contexto Electron — componentes não são portáveis
- `window.electronAPI` no tipo vaza abstração de plataforma

**Custo de implementação:** XS

### Opção C: Acesso direto ao window.electronAPI (manter V1)
**Descrição:** Continuar chamando `window.electronAPI.*` nos componentes.

**Pros:**
- Zero esforço

**Contras:**
- Todos os problemas de V1 permanecem
- Incompatível com boundary de packages (ADR-0006): `packages/ui` não pode depender de `electron`

**Custo de implementação:** XS (mas tech debt alto)

## Decisão

**Opção A**. O boundary de packages exige que `packages/ui` e `packages/features` não importem `electron`. `PlatformContext` é a única interface que satisfaz esse boundary enquanto mantém funcionalidade completa. O overhead de tRPC é negligenciável para operações de UI (não são hot paths).

Contrato mínimo adotado:

```ts
interface PlatformContextValue {
  readFileAsDataUrl: (filePath: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<string | null>;
}
```

Ordem na árvore de providers em `main.tsx`:
```
ThemeProvider → PlatformProvider → TRPCProvider → RouterProvider
```

`PlatformProvider` precisa estar acima de `TRPCProvider` pois pode ser mockado em testes sem o cliente tRPC.

## Consequências

### Positivas
- `packages/ui` e `packages/features` sem nenhuma referência a `electron`
- Testes de componentes usam `<MockPlatformProvider>` sem preload real
- Componentes portáveis para `apps/viewer` se necessário

### Negativas / Trade-offs
- `PlatformProvider` precisa registrar procedure tRPC por ação exposta
- Adicionar nova ação host-specific requer atualizar interface + provider + router IPC

### Neutras
- `usePlatform()` lança `Error` se usado fora do `PlatformProvider` — falha explícita

## Validação

- `pnpm check:cruiser` não detecta import de `electron` em `packages/ui` ou `packages/features`
- `readFileAsDataUrl` funciona em file preview sem acesso direto ao preload
- Componentes de `packages/ui` passam em testes com `MockPlatformProvider`

## Referencias

- TASK-10-05: Platform provider + file bridge
- ADR-0013: Platform abstraction layer
- ADR-0006: Package boundaries
- ADR-0020: IPC tRPC layer

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-05)
