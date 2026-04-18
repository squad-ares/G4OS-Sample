# ADR 0011: Result pattern with neverthrow

## Metadata

- **Numero:** 0011
- **Status:** Proposed
- **Data:** 2026-04-17
- **Autor(es):** @squad-ares
- **Épico:** 01-kernel (TASK-01-02)

## Contexto

v1 usava exceções para erros em toda parte. Problemas:

1. **Erro silencioso:** exceptions não propagadas = bug invisível até produção
2. **Contrato oculto:** função não documenta quais exceções pode lançar
3. **Stack traces inúteis:** erro em async/await cria trails de pilha confusos
4. **Tratamento inconsistente:** alguns erros logados, outros não

Exemplo problema:
```ts
// Qual exceção pode ser lançada?
async function saveSession(session: Session): Promise<void> {
  const json = JSON.stringify(session);        // SyntaxError?
  fs.writeFileSync(path, json);                // EACCES? ENOENT?
  const encrypted = await encrypt(json);       // EncryptError?
  // ...
}

// Chamador não sabe como tratar:
try {
  await saveSession(session);
} catch (e) {
  // Log? Retry? Notify user?
  console.error(e);
}
```

Em v2, queremos **Result<T, E>** pattern (Railway Oriented Programming):

```ts
type Result<T, E> = 
  | { isOk: true; value: T }
  | { isErr: true; error: E }

async function saveSession(session: Session): Promise<Result<void, SaveError>> {
  return Result.try(async () => {
    const json = JSON.stringify(session);
    fs.writeFileSync(path, json);
    const encrypted = await encrypt(json);
    // ...
  }).catch((e) => new SaveError(...));
}
```

Vantagens:
- **Contrato explícito:** tipo de retorno documenta possíveis erros
- **Type-safe:** compilador força tratamento
- **Composição:** chain results com `.map()`, `.flatMap()`
- **Stack traces:** preservados no `error` sem perder context

**Evidência:**
- Bugs em produção por exceção não tratada
- Dificuldade em debugar qual erro aconteceu (genérico "failed")
- Inconsistência de tratamento entre módulos

## Opções consideradas

### Opção A: neverthrow Result<T, E>
**Descrição:**
Usar `neverthrow` (mesmo que pnpm, ts-rest, outras libs populares). Estrutura:

```ts
import { Result, ResultAsync, ok, err } from 'neverthrow';

// Sync result
const parseResult: Result<User, ParseError> = userSchema.safeParse(data)
  ? ok(userSchema.parse(data))
  : err(new ParseError(...));

// Async result
const saveResult: ResultAsync<void, SaveError> = ResultAsync.fromPromise(
  saveToDb(user),
  (error) => new SaveError('db_write_failed', error)
);

// Composition
const result = saveResult
  .map(() => ({ success: true }))
  .mapErr((e) => ({ error: e.code }))
  .match(
    (ok) => ok,
    (err) => err
  );
```

**Pros:**
- Libraria estabelecida (pnpm, ts-rest, Drizzle, etc.)
- TypeScript-first
- Composição elegante
- Pequena: ~5kB

**Contras:**
- Uma dependência a mais (mas já planeja usar)
- Overhead de memória em happy path

**Custo de implementação:** S (1-2 dias)

### Opção B: Go-style (retorna `[T, Error]`)
**Descrição:**
```ts
async function saveSession(session: Session): Promise<[void, SaveError | null]> {
  try {
    // ...
    return [undefined, null];
  } catch (e) {
    return [undefined, new SaveError(...)];
  }
}

const [, err] = await saveSession(session);
if (err) {
  // handle error
}
```

**Pros:**
- Zero dependência
- Simples

**Contras:**
- Fácil de esquecer de checar erro (TS ainda permite)
- Sem composição (não tem `.map()`)
- Menos idiomático em TS

**Custo de implementação:** M (2-3 dias, mais boilerplate)

### Opção C: Exceções com wrapper assíncrono
**Descrição:**
Manter try/catch, mas envolver chamadas com helper `tryCatch`:

```ts
const result = await tryCatch(() => saveSession(session));
if (result.ok) {
  // ...
} else {
  // result.error
}
```

**Pros:**
- Familiar (exceções existentes)
- Menos refactor

**Contras:**
- Sem type-safety no compile
- Wrapper ainda é Result-like, então não ganha nada vs Opção A
- Runtime overhead do try/catch

**Custo de implementação:** S (1 dia, mas sem benefício real)

## Decisão

Optamos pela **Opção A (neverthrow)** porque:

1. **Type-safety:** compilador força tratamento de erro
2. **Composição:** `.map()`, `.flatMap()`, `.match()` elegante
3. **Ecosystem:** pnpm, ts-rest, outros já usam, padrão crescente
4. **Auditoria:** cada função documentada sobre erros possíveis
5. **Sem overhead vs Opção C:** wrapper é Result mesmo, então já é custo

## Consequências

### Positivas
- Contrato de função é explícito (qual erro pode retornar)
- Type-safe: TS rejeita `result.value` sem checar `.isOk()` primeiro
- Composição natural: chain múltiplos Results
- Fácil de testar: Result isolado sem side effects
- Stack traces preservados em `error.cause`

### Negativas / Trade-offs
- **Refactor:** toda função que lança exceção precisa ser envolvida
- **Verbosidade:** mais `.isOk()` checks que simples try/catch
- **Overhead:** pequeno aumento de memória (ok object alocado)
- **Aprendizado:** devs acostumados a throw precisam aprender Result
- **Async overhead:** `ResultAsync` adiciona Promise abstraction

### Neutras
- Hierarquia de erros (AppError com code + context) é orthogonal a Result
- Logging é feito no AppError `toJSON()`, não no Result

## Validação

Como saberemos que essa decisão foi boa?

- Todas as funções de kernel exportadas têm tipo de retorno `Result<T, E>`
- Zero `any` types em handling de erros
- Testes mostram que erro é explicitamente tratado ou propagado
- Code review rejeita `catch (e: any)` — use Result.fromPromise instead
- Revisão em 2026-05-15 para avaliar se devs adotaram padrão

## Implementação no kernel

**TASK-01-02:**
- Instalar `neverthrow@8.2.0` (dependência única de kernel)
- Hierarquia: `AppError` base + `AuthError`, `IpcError`, `SessionError`, etc.
- Cada erro tem `code: ErrorCode` + `context: Record<string, any>` + `cause?: Error`
- Função helper `toResult(promise)` para wrap promises em `ResultAsync`

**Padrão:**
```ts
// Sync error
function validate(data: unknown): Result<Data, ValidationError> {
  return parseSchema(DataSchema, data).mapErr(e => new ValidationError(...));
}

// Async error
function fetch(): ResultAsync<User, FetchError> {
  return ResultAsync.fromPromise(
    api.get('/user'),
    (error) => new FetchError('network_error', error)
  );
}

// Chain
validate(data)
  .asyncFlatMap(fetch)
  .map(user => user.name)
  .match(
    (ok) => ok,
    (err) => console.error(err.code)
  );
```

## Histórico de alterações

- 2026-04-17: Proposta inicial
- (pendente) Aceita pelo time
