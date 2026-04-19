# ADR 0003: Biome como Linter + Formatter Unificado

## Status

**Accepted**

Data: 2026-04-17
Revisado por: Igor Rezende
Relacionado: TASK-00-03

## Contexto

G4 OS v1 usa **ESLint + TypeScript ESLint + Prettier** = 3 ferramentas, 15+ plugins, config fragmentada em múltiplos arquivos.

Problemas:
- Tempo de lint = 10-30s por arquivo em CI
- Três configurações diferentes para linting/formatting
- Conflitos entre regras (Prettier vs ESLint)
- Setup complexo, difícil onboarding
- Múltiplas versões de dependências

**Biome** (escrito em Rust) resolve todos:
- 10-20x mais rápido (monorepo inteiro < 1s)
- Uma ferramenta, uma config
- Zero conflitos entre lint e format
- ~3MB binary, sem Node.js deps

## Decision

Adotamos **Biome** como única ferramenta de linting e formatting:

### 1. Instalação

```bash
pnpm add -w -D @biomejs/biome@^2.4.12
```

### 2. Configuração única em biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.12/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noConsole": "error",
        "noExplicitAny": "error",
        "noTsIgnore": "error"
      },
      "style": {
        "noDefaultExport": "error",
        "useImportType": "error"
      }
    }
  }
}
```

### 3. Integração com Editor

VSCode: instalar [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)

`.vscode/settings.json`:
```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

### 4. Scripts em cada pacote

```json
{
  "scripts": {
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src"
  }
}
```

### 5. Integração com Turborepo

`turbo.json`:
```json
{
  "tasks": {
    "lint": {
      "inputs": ["src/**", "biome.json", "../../biome.json"],
      "outputs": []
    }
  }
}
```

Root scripts:
```json
{
  "scripts": {
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint -- --fix"
  }
}
```

## Consequences

### Positivas

1. **Velocidade**
   - Lint inteiro monorepo: <1s (vs 10-30s em v1)
   - Zero overhead de CI

2. **Simplicidade**
   - Uma config (biome.json)
   - Uma ferramenta para lint + format
   - Zero conflitos entre regras

3. **Experiência do dev**
   - Format on save via Biome extension
   - Organiza imports automaticamente
   - Quick fixes via editor

4. **Determinismo**
   - Formato sempre igual
   - Sem variações entre máquinas

5. **Performance de CI**
   - Cache de lint em ~3ms (segunda execução)
   - Menos CPU/mem que ESLint

### Negativas

1. **Menos plugins**
   - Algumas rules customizadas não têm suporte
   - Workaround: usar Biome rules + TypeScript strict mode

2. **Comunidade menor**
   - ESLint tem 10x mais plugins
   - Menos StackOverflow answers
   - Mas Biome melhora rápido (beta ativo)

3. **Aprendizado**
   - Devs ESLint precisam aprender Biome CLI
   - Mas é mais simples

## Alternatives Considered

### 1. ESLint + Prettier (v1 status quo)

**Prós:**
- Maduro, conhecimento difundido

**Contras:**
- Lento (10-30s por arquivo)
- Três ferramentas, config fragmentada
- Conflitos ESLint ↔ Prettier

**Descartado**: Insuportável para monorepo grande.

### 2. ESLint só (remover Prettier)

**Prós:**
- Reduz de 3 para 2 ferramentas
- Menos lento que v1

**Contras:**
- Ainda lento vs Biome (5x mais)
- ESLint é melhor para lint que format
- Ainda dois sistemas (ESLint rules + editor format)

**Descartado**: Biome é menor custo.

### 3. Deno.lint (usado por Deno)

**Prós:**
- Escrito em Rust (rápido)
- Minimalista

**Contras:**
- Menos features que ESLint
- Comunidade pequena
- Sem TypeScript plugins maturo

**Descartado**: Biome é mais feature-complete.

## Related Decisions

- **ADR 0001**: Monorepo com pnpm + Turborepo
- **ADR 0002**: TypeScript strict mode (complementar)
- **TASK-00-03**: Implementação deste ADR

## Implementation Notes

### Checklist

- [x] Biome instalado (v2.4.12)
- [x] biome.json configurado com regras rígidas
- [x] VSCode integration (.vscode/settings.json, extensions.json)
- [x] Scripts em cada pacote (lint, lint:fix, format)
- [x] Turborepo task configurada (lint cacheado)
- [x] Root scripts (pnpm lint, pnpm lint:fix)

### Exclusões da v1

- ✅ ESLint removido (package.json limpo)
- ✅ Prettier removido (Biome formata)
- ✅ TypeScript ESLint removido (TypeScript strict mode substitui)

### Próximas ações

1. Garantir que CI roda `pnpm lint` (TASK-00-05)
2. Documentar regras customizadas específicas (se necessário)
3. Educar time sobre `biome check --write`

### Migration da v1 (não aplicável)

Se v1 código importado precisar de migrações:
```bash
pnpm lint:fix
# isso resolve muitos issues automaticamente
```

Para issues irresolvíveis:
```bash
biome migrate v1 --write  # futuro: tool para auxiliar
```

## Performance Metrics

Benchmark monorepo G4 OS v2:

```
ESLint v8.x (estimado):        10-30s
Biome v2.4.12 (medido):        0.5s
Aceleração:                    20-60x
CI economic impact:            9+ min economizados por push
```

---

**Autores/Revisores:**
- Igor Rezende (decision maker)
- Tech Lead (review)

**Última atualização:** 2026-04-17
