# ADR 0012: Disposable pattern for resource management

## Metadata

- **Numero:** 0012
- **Status:** Proposed
- **Data:** 2026-04-17
- **Autor(es):** @squad-ares
- **Stakeholders:** @frontend-lead, @backend-lead, @qa-lead
- **Épico:** 01-kernel (TASK-01-03)

## Contexto

v1 tinha memory leaks por recursos não liberados:

1. **Event listeners orphaned:** `.addEventListener()` sem `.removeEventListener()`
2. **Timers não cancelados:** `setInterval` sem `clearInterval`
3. **DB connections:** conexões SQLite aberta mas nunca fechada
4. **WebSocket não desconectado:** listeners acumulam
5. **Processo filhos:** spawn sem kill

Exemplo problema:
```ts
// Router setup — listeners adicionados
router.subscribe(handler);
router.subscribe(handler);  // ops, segunda cópia se ninguém faz cleanup

// Sem forma explícita de cleanup:
// - Qual é o handle para desinscrever?
// - Em qual ponto devo chamar unsub?
// - E se esquecer?
```

Em v2, adotamos **IDisposable pattern** (VS Code, Typescript Compiler, etc.):

```ts
interface IDisposable {
  dispose(): void;
}

class Router implements IDisposable {
  private listeners: Set<Handler> = new Set();
  private disposed = false;

  subscribe(handler: Handler): IDisposable {
    this.listeners.add(handler);
    return {
      dispose: () => this.listeners.delete(handler)
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.disposed = true;
  }
}

// Uso:
const router = new Router();
const unsub = router.subscribe(handler);
unsub.dispose();  // cleanup explícito
router.dispose();  // cleanup total
```

**Benefícios:**
- Cleanup explícito no tipo
- Composição: `DisposableStore` agrupa múltiplos resources
- Type-safe: TS avisa se esquecer de chamar `dispose()`
- Padrão familiar (VS Code, stdlib outras languages)

## Opções consideradas

### Opção A: IDisposable + DisposableStore (adotada em v1 UI)
**Descrição:**
Interface `IDisposable` com `dispose()` method. Store acumula disposables e chama todos no `.dispose()`.

```ts
interface IDisposable {
  dispose(): void;
}

class DisposableStore implements IDisposable {
  private items: IDisposable[] = [];

  add<T extends IDisposable>(disposable: T): T {
    this.items.push(disposable);
    return disposable;
  }

  dispose(): void {
    // Dispose in reverse order
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].dispose();
    }
    this.items.length = 0;
  }
}

// Uso:
const store = new DisposableStore();
store.add(router.subscribe(handler));
store.add(db.connect());
store.dispose();  // limpa tudo
```

**Pros:**
- Simples, familiar
- Composição natural
- Type-safe
- Sem dependência

**Contras:**
- Manual — dev precisa lembrar de criar store e adicionar recursos
- Não mata automatic cleanup (React hooks etc)

**Custo de implementação:** S (1 dia)

### Opção B: WeakMap + GC (automático)
**Descrição:**
Usar WeakMap para rastrear recursos automaticamente e liberar quando objeto é GC'd.

```ts
const resources = new WeakMap<object, IDisposable>();

function onGC(obj: object, disposable: IDisposable) {
  resources.set(obj, disposable);
  // FinalizationRegistry chamará dispose() ao GC
}
```

**Pros:**
- Automático, dev não precisa chamar dispose()
- Evita memory leaks por esquecimento

**Contras:**
- Timing não determinístico (quando GC roda?)
- FinalizationRegistry é experimental
- Mais lento

**Custo de implementação:** L (5+ dias, research)

### Opção C: TypeScript decorators + AOP
**Descrição:**
Usar decorators para marcar métodos que precisam cleanup:

```ts
@AutoDisposable()
class Router {
  @OnDispose()
  cleanup() { /* ... */ }
}
```

**Pros:**
- Menos boilerplate

**Contras:**
- Decorators ainda experimentais (mesmo em TS 5.x)
- Magic — obscurece quando cleanup é chamado
- Não tão composável

**Custo de implementação:** M (2-3 dias)

## Decisão

Optamos pela **Opção A (IDisposable + DisposableStore)** porque:

1. **Explícito:** dev sabe exatamente quando cleanup é chamado
2. **Composição:** múltiplos recursos em um Store
3. **Padrão:** usado por VS Code, TypeScript compiler, Fastify, etc.
4. **Zero dependência:** código puro, sem magic
5. **Type-safe:** `dispose()` é obrigatório, não esquecível

Opção B é boa para futuro (gc.collect() em cleanup paths críticos), mas Opção A é suficiente e explícita.

## Consequências

### Positivas
- Cleanup explícito: dev vê quando recursos são liberados
- Type-safe: TS rejeita classes sem `dispose()`
- Composição: DisposableStore agrupa múltiplos recursos
- Familiar: padrão estabelecido em muitas libs
- Testável: mock IDisposable é trivial

### Negativas / Trade-offs
- **Manual:** dev precisa lembrar de chamar `dispose()`
- **Boilerplate:** `implements IDisposable` em toda classe com recursos
- **Ordem importa:** DisposableStore dispõe em reverse order (LIFO), não FIFO
- **Sem automaticidade:** esquecimento ainda causa leak

### Neutras
- React `useEffect` + `return cleanup` é idioma compatible (adotamos em @g4os/ui)
- AbortSignal pattern (`bindToAbort`) é alternativa para async
- Não é substituível para async (promises não têm dispose)

## Validação

Como saberemos que essa decisão foi boa?

- Todas as classes com recursos (listeners, timers, DB) implementam IDisposable
- DisposableStore testes cobrem: add/delete/deleteAndDispose/dispose, AggregateError em falha
- Zero memory leaks em testes de longa duração (100+ session create/delete)
- Linter rule: `@typescript-eslint/no-floating-promises` rejeita `.subscribe()` sem capturar unsub
- Revisão em 2026-05-15 para avaliar cobertura de recursos críticos

## Implementação no kernel

**TASK-01-03:**

```ts
// types.ts
interface IDisposable {
  dispose(): void;
}

// disposable-store.ts
class DisposableStore implements IDisposable {
  private items: IDisposable[] = [];
  private disposed = false;

  add<T extends IDisposable>(disposable: T): T {
    if (this.disposed) throw new Error('DisposableStore is disposed');
    this.items.push(disposable);
    return disposable;
  }

  delete(disposable: IDisposable): boolean {
    const index = this.items.indexOf(disposable);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  deleteAndDispose(disposable: IDisposable): void {
    if (this.delete(disposable)) {
      disposable.dispose();
    }
  }

  dispose(): void {
    const errors: Error[] = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.items.length = 0;
    this.disposed = true;

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Errors while disposing');
    }
  }
}

// disposable-base.ts
abstract class DisposableBase implements IDisposable {
  private store = new DisposableStore();

  protected _register<T extends IDisposable>(disposable: T): T {
    return this.store.add(disposable);
  }

  dispose(): void {
    this.store.dispose();
  }
}

// helpers.ts
function toDisposable(dispose: () => void): IDisposable {
  return { dispose };
}

function combinedDisposable(...disposables: IDisposable[]): IDisposable {
  return {
    dispose() {
      for (const d of disposables) {
        d.dispose();
      }
    }
  };
}

function bindToAbort(disposable: IDisposable, signal: AbortSignal): void {
  if (signal.aborted) {
    disposable.dispose();
  } else {
    signal.addEventListener('abort', () => disposable.dispose());
  }
}
```

## Histórico de alterações

- 2026-04-17: Proposta inicial
- (pendente) Aceita pelo time
