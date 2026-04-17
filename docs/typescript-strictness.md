```typescript
// exactOptionalPropertyTypes: true

// ERRADO
const config: { port?: number } = { port: undefined }; // erro

// CERTO
const config: { port?: number } = {}; // ok
const config: { port?: number } = { port: 3000 }; // ok

// noUncheckedIndexedAccess: true

// ERRADO
const first = items[0]; // first: T
first.toUpperCase(); // funcionava em v1; erro em v2

// CERTO
const first = items[0];
if (first !== undefined) {
  first.toUpperCase();
}
// OU
const first = items.at(0) ?? '';
```