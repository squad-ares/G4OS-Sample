# ADR 0002: TypeScript Strict Mode Absoluto

## Status

**Accepted**

Data: 2026-04-17
Revisado por: Tech Lead
Relacionado: TASK-00-02

## Contexto

G4 OS v1 teve **194 usos de `any`** e **8 `@ts-ignore`** no código de produção. Isso representou falha de tipagem que permitiu bugs clássicos passarem silenciosamente (ex: perda de credenciais, memory leaks em websockets).

TypeScript oferece ~25 flags de type-checking que **não estão ligadas por padrão**. Uma abordagem séria liga todas as disponíveis.

## Decision

Adotamos **TypeScript strict mode absoluto** com regras complementares de linter:

### 1. tsconfig.base.json com máximo strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true
  }
}
```

### 2. Regras complementares de Biome

```json
{
  "suspicious": {
    "noExplicitAny": "error",
    "noTsIgnore": "error"
  },
  "style": {
    "useImportType": "error"
  }
}
```

### 3. Cada pacote estende base sem frouxar

Cada `packages/*/tsconfig.json` estende `tsconfig.base.json` e não pode sobrescrever as flags de strictness com valores menos rigorosos.

### 4. Integração com CI

- `pnpm typecheck` roda em todos os pacotes
- Turbo cache mantém segunda execução em <50ms
- CI falha se houver erro de type

## Consequences

### Positivas

1. **Previne bugs clássicos**
   - `arr[0].foo` sem check = erro de compilação
   - `null` e `undefined` são explícitos, não implícitos
   - Perda de valores impossível em atribuição

2. **Refatoração segura**
   - Renomear ou remover campo de interface = erro compile-time em todas as call-sites
   - Sem "silently undefined" bugs após refactor

3. **Documentação viva**
   - Tipos servem como spec do código
   - Sem gap entre "tipo do TypeScript" e "verdadeiro tipo"

4. **Zero custo de runtime**
   - Todas as verificações são compile-time
   - Sem overhead de runtime

### Negativas

1. **Curva de aprendizado**
   - Devs de JavaScript acham rigid
   - `exactOptionalPropertyTypes` é confuso inicialmente
   - `noUncheckedIndexedAccess` força defensive code patterns

2. **Bugs-catch atrasados**
   - `as const` assertions precisam ser aprendidas
   - Casting às vezes necessário para tipos third-party mal-tipados

3. **Setup inicial mais lento**
   - Primeira build tipa tudo
   - Mas cache compensa rapidamente

## Alternatives Considered

### 1. Strict mode parcial (only `strict: true`)

```json
{ "compilerOptions": { "strict": true } }
```

**Prós:**
- Mais simples, menos rules

**Contras:**
- Deixa buracos (ex: `arr[0]` vira `T | undefined` mas não força check)
- V1 tinha `strict: true` mas ainda 194 `any`

**Descartado**: Insuficiente para prevenir os bugs da v1.

### 2. Strict mode com escape hatch (`as any` permitido)

```json
{
  "compilerOptions": { "strict": true },
  "linter": { "suspicious": { "noExplicitAny": "warn" } }
}
```

**Prós:**
- Permite escape temporário

**Contras:**
- Escape vira norma
- PRs com `any` viram "problema de amanhã"

**Descartado**: Discipline must be enforced from day 1.

### 3. Gradual migration (strict em alguns paths, loose em outros)

```json
{
  "compilerOptions": { "strict": false },
  "overrides": [
    { "includes": ["src/**"], "strict": true },
    { "includes": ["migration/**"], "strict": false }
  ]
}
```

**Prós:**
- Permite migração gradual

**Contras:**
- Confunde devs qual é a "verdade"
- Migrações nunca completam

**Descartado**: v2 nasce strict, sem legado.

## Related Decisions

- **ADR 0001**: Monorepo structure com pnpm + Turborepo
- **TASK-00-02**: Implementação deste ADR
- **docs/typescript-strictness.md**: Exemplos de pegadinhas e patterns

## Implementation Notes

### Checklist

- [x] tsconfig.base.json com strict mode máximo
- [x] Biome rules noExplicitAny e noTsIgnore = error
- [x] Cada pacote estende base sem frouxar
- [x] Testes que verificam que strict está ativo
- [x] Documentação com exemplos de pegadinhas

### Próximas ações

1. Executar `pnpm typecheck` em CI (TASK-00-05)
2. Educar time sobre patterns (docs/typescript-strictness.md)
3. Code reviews focam em tipos primeiro

### Rollback (improvável)

Se strict mode se provar insuportável:
1. Mudar `noExplicitAny` de "error" para "warn"
2. Perda de ~30% de proteção
3. Esforço: ~1 hora (revert commit)

Custo esperado: Minúsculo se feito nos primeiros dias. Improável depois de mais código.

---

**Autores/Revisores:**
- Igor Rezende (decision maker)
- Tech Lead (review)

**Última atualização:** 2026-04-17
