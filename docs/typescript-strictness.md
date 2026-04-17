# TypeScript Strictness — Common Pitfalls & Patterns

G4 OS usa TypeScript em modo strict absoluto. Este documento explica as flags que mais pegam devs e como trabalhar com elas.

## 1. exactOptionalPropertyTypes

**Flag:** Diferencia `x?: T` (property é opcional) de `x: T | undefined` (property é obrigatória mas pode ser undefined).

### Erro comum

```typescript
// ❌ ERRADO
const config: { port?: number } = { port: undefined }; // erro!

// CERTO
const config: { port?: number } = {}; // ok, property não existe
const config: { port?: number } = { port: 3000 }; // ok, property tem valor

// Alternativa: se realmente quer undefined
const config: { port?: number | undefined } = { port: undefined }; // ok (redundante mas explícito)
```

### Pattern recomendado

```typescript
// Usar omit ao copiar objetos, não undefined
const defaults = { port: 3000, host: 'localhost' };
const userConfig: Partial<typeof defaults> = { host: '0.0.0.0' };
const final = { ...defaults, ...userConfig }; // tipo correto
```

## 2. noUncheckedIndexedAccess

**Flag:** Força que acessos a array/object sejam defensivos. `arr[0]` vira `T | undefined`.

### Erro comum

```typescript
// ❌ ERRADO
const first = items[0]; // first: T
first.toUpperCase(); // funcionava em v1; erro em v2

// CERTO: opção 1 — if guard
const first = items[0];
if (first !== undefined) {
  first.toUpperCase();
}

// CERTO: opção 2 — Array.at()
const first = items.at(0);
if (first) first.toUpperCase();

// CERTO: opção 3 — nullish coalescing
const first = items[0] ?? '';
first.toUpperCase(); // ok, string garantida
```

### Com objects

```typescript
type User = { name: string };
const users: Record<string, User> = {};

// ❌ ERRADO
const user = users['admin'];
console.log(user.name); // erro: user pode ser undefined

// CERTO
const user = users['admin'];
if (user) {
  console.log(user.name);
}
```

## 3. noExplicitAny

**Flag:** Ativa regra de linter que bloqueia `any`.

### Erro comum

```typescript
// ❌ ERRADO
function process(data: any) {
  return data.toUpperCase();
}

// CERTO: opção 1 — tipo específico
function process(data: string) {
  return data.toUpperCase();
}

// CERTO: opção 2 — generic
function process<T>(data: T): T {
  return data;
}

// CERTO: opção 3 — unknown com type guard
function process(data: unknown) {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
  throw new Error('Expected string');
}
```

## 4. verbatimModuleSyntax

**Flag:** Força `import type` para importações de tipos, `import` para valores.

### Erro comum

```typescript
// ❌ ERRADO (mistura tipo e valor)
import { User, getUserData } from './user';

// CERTO
import type { User } from './user';
import { getUserData } from './user';

// OU se ambos
import type { User } from './user';
import { type UserConfig, getUserData } from './user';
```

## 5. noImplicitReturns

**Flag:** Força que todos os code paths retornem algo explicitamente.

### Erro comum

```typescript
// ❌ ERRADO
function greet(name?: string): string {
  if (name) {
    return `Hello, ${name}`;
  }
  // implicit return undefined
}

// CERTO
function greet(name?: string): string {
  if (name) {
    return `Hello, ${name}`;
  }
  return 'Hello, stranger';
}

// OU se quer permitir undefined
function greet(name?: string): string | undefined {
  if (name) {
    return `Hello, ${name}`;
  }
}
```

## 6. strictNullChecks + strictPropertyInitialization

**Flag:** Classes precisam inicializar properties ou declarar como optional.

### Erro comum

```typescript
// ❌ ERRADO
class User {
  name: string; // erro: não inicializado
  constructor(n: string) {
    this.name = n;
  }
}

// CERTO: opção 1 — inicializar no construtor
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// CERTO: opção 2 — declarar optional
class User {
  name?: string;
}

// CERTO: opção 3 — inicializar no declaration
class User {
  name: string = '';
}

// CERTO: opção 4 — non-null assertion (só se tiver bom motivo)
class User {
  name!: string;
  async load() {
    this.name = await fetchName();
  }
}
```

## 7. noImplicitThis

**Flag:** `this` sem tipo explícito é erro.

### Erro comum

```typescript
// ❌ ERRADO
const obj = {
  value: 42,
  getValue() {
    return this.value; // erro: this implícito
  }
};

// CERTO: opção 1 — arrow function
const obj = {
  value: 42,
  getValue: () => obj.value,
};

// CERTO: opção 2 — tipar this
const obj = {
  value: 42,
  getValue(this: typeof obj) {
    return this.value;
  }
};
```

## Padrões recomendados

### Result<T, E> em vez de try/catch

```typescript
import { ok, err, Result } from 'neverthrow';

export async function fetchUser(id: string): Promise<Result<User, 'not_found'>> {
  const user = await db.get(id);
  if (!user) return err('not_found');
  return ok(user);
}

// Uso
const result = await fetchUser('123');
if (result.isErr()) {
  console.error(`User not found`);
  return;
}
const user = result.value; // typed como User, não null
```

### Assertion functions

```typescript
function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected string, got ${typeof value}`);
  }
}

// Uso
function process(value: unknown) {
  assertIsString(value);
  return value.toUpperCase(); // value: string agora
}
```

### Generic constraints

```typescript
// ❌ ERRADO
function getLength(arr: any[]) {
  return arr.length;
}

// CERTO
function getLength<T>(arr: T[]): number {
  return arr.length;
}

// CERTO: com constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## Resources

- [TypeScript strictness flags](https://www.typescriptlang.org/tsconfig#Type_Checking)
- [noUncheckedIndexedAccess deep dive](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html#no-unchecked-indexed-access)
- [exactOptionalPropertyTypes explained](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)
- [ADR 0002: TypeScript Strict Mode](./adrs/0002-typescript-strict-mode.md)