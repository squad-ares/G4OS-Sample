# ADR 0100: WindowManager — estado de janela persistido por workspace

## Metadata

- **Numero:** 0100
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

V1 permitia múltiplas janelas (window-per-workspace) mas sem estado persistido: tamanho, posição e workspace associado eram perdidos ao fechar o app. O usuário recomeçava sempre com janela centralizada padrão.

Além disso, `BrowserWindow` era criado diretamente em `apps/electron/src/main/index.ts` com lógica espalhada — sem encapsulamento, sem recuperação de estado, sem mapeamento workspace→janela.

## Opções consideradas

### Opção A: WindowManager dedicado com persistência em SQLite
**Descrição:** Classe `WindowManager` responsável por criar, rastrear e restaurar janelas. Estado (posição, tamanho, isMaximized) salvo em tabela SQLite `window_states` via `@g4os/data`.

**Pros:**
- Consistente com a camada de dados já adotada (ADR-0040a)
- Restauração confiável após crash (SQLite é durável)
- Encapsulamento limpo: nada fora do `WindowManager` toca `BrowserWindow` diretamente

**Contras:**
- Depende de `@g4os/data` estar disponível no boot (antes das sessões)
- Schema extra na migration

**Custo de implementação:** S (1-2 dias)

### Opção B: WindowManager com persistência em JSON local
**Descrição:** Estado salvo em `~/.g4os/window-states.json` via `@g4os/platform`.

**Pros:**
- Sem dependência em `@g4os/data`
- Mais simples para bootstrapping inicial

**Contras:**
- Escrita não-atômica sem lock pode corromper ao fechar abruptamente
- Inconsistente com o padrão do resto da persistência do app

**Custo de implementação:** XS

## Decisão

Optamos pela **Opção B** como primeira implementação (TASK-10-01), com caminho claro para migrar para SQLite no épico de dados. Razão: `WindowManager` é instanciado antes do `DatabaseService` no fluxo de boot em `apps/desktop/src/main/index.ts`; criar dependência circular de boot aumenta complexidade sem benefício imediato dado que corrupção de `window-states.json` tem consequência apenas cosmética (janela abre em posição padrão).

Escrita usa `write→fsync→rename` atômico via `@g4os/platform/paths` para mitigar corrupção.

## Consequências

### Positivas
- Janela restaura posição/tamanho/maximizado ao reabrir
- Mapeamento workspace→janela previne duplicatas
- `WindowManager` é o único lugar que instancia `BrowserWindow`

### Negativas / Trade-offs
- Arquivo JSON adicional em `~/.g4os/`
- Migração para SQLite necessária quando `DatabaseService` for disponível no boot

### Neutras
- Submetido a `IDisposable` — cleanup no shutdown flush o estado pendente

## Validação

- Reopening após fechar restaura mesma posição (smoke test manual)
- Crash seguido de restart não corrompe `window-states.json`
- `WindowManager` encapsula 100% das chamadas a `new BrowserWindow`

## Referencias

- TASK-10-01: Multi-window management
- ADR-0031: Main thin-layer (<2000 LOC)
- ADR-0040a: node:sqlite (migração futura)
- ADR-0012: Disposable pattern

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-01)
