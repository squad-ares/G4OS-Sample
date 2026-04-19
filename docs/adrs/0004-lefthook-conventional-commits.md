# ADR 0004: Lefthook para Git Hooks + Conventional Commits Obrigatório

## Status

**Accepted**

Data: 2026-04-17
Revisado por: Igor Rezende
Relacionado: TASK-00-04

## Contexto

G4 OS v1 usa **Husky** para git hooks. Problemas:

1. **Frágil:**
   - Baseia-se em `node_modules/.bin/husky`
   - Quebra em fork/WSL devido a paths hardcoded
   - Requer `prepare` script que devs esqueçam

2. **Sem Conventional Commits:**
   - Mensagens de commit são caóticas
   - Changelog deve ser escrito manualmente
   - Não há signal para semantic versioning
   - `git log` é ilegível para automação

3. **Lento:**
   - ESLint + Prettier em cada commit
   - Devs pulem com `--no-verify`
   - CI não consegue garantir qualidade

## Decision

Adotamos **Lefthook** + **Conventional Commits**:

### 1. Substituir Husky por Lefthook

```bash
pnpm add -w -D lefthook
```

**Vantagens de Lefthook:**
- Escrito em Go, binary único, ~5MB
- Config em YAML (simples, legível)
- Instala via `prepare` script (automático)
- Suporta WSL, Git Bash, macOS natively
- 5-10x mais rápido que Husky

### 2. Configurar hooks em `lefthook.yml`

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx,js,jsx,json}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true

commit-msg:
  commands:
    commitlint:
      run: pnpm commitlint --edit {1}

pre-push:
  commands:
    full-lint:
      run: pnpm lint
    full-typecheck:
      run: pnpm typecheck
    test-affected:
      run: pnpm turbo run test --filter=...[origin/main]

post-merge:
  commands:
    install:
      glob: "{pnpm-lock.yaml,package.json}"
      run: pnpm install
```

**Hooks explained:**

- **pre-commit**: Roda `biome check` em staged files (rápido, apenas alterações)
- **commit-msg**: Valida formato com commitlint
- **pre-push**: Roda full lint, typecheck, affected tests
- **post-merge**: Auto-instala se deps mudaram

### 3. Institutional Conventional Commits

```javascript
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'perf', 'refactor',
      'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert'
    ]],
    'scope-enum': [2, 'always', [
      'foundation', 'kernel', 'platform', 'ipc', 'credentials',
      'ui', 'agents', 'sources', 'features',
      'chat', 'sessions', 'workspaces', 'projects', 'marketplace',
      'company-context', 'scheduler', 'vigia', 'remote-control',
      'voice', 'skills', 'browser',
      'desktop', 'viewer',
      'deps', 'ci', 'build', 'release', 'docs', 'config'
    ]],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', ['sentence-case', 'lower-case']],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100]
  }
};
```

### 4. Obrigatório no `prepare` script

```json
{
  "scripts": {
    "prepare": "lefthook install"
  }
}
```

Roda automaticamente após `pnpm install`, sem ação manual necessária.

## Consequences

### Positivas

1. **Qualidade garantida**
   - Commits sempre bem-formatted
   - Mensagens estruturadas
   - CI valida as mesmas regras (--no-verify não ajuda)

2. **Changelog automático**
   - Conventional Commits + changesets = changelog auto-gerado
   - `feat:` = feature na release notes
   - `fix:` = bug fixes
   - `perf:` = improvements

3. **Semantic versioning derivável**
   - Major: breaking change (`feat!:` ou `BREAKING CHANGE:`)
   - Minor: novo recurso (`feat:`)
   - Patch: bug fix (`fix:`)

4. **Git log legível**
   - `git log --oneline` mostra histórico estruturado
   - Automação pode parsear commits
   - Devs entendem mudanças rapidamente

5. **Performance**
   - Lefthook rápido (pre-commit apenas em staged files)
   - Cache de lint/typecheck (segunda execução < 100ms)
   - WSL funciona natively (sem hacks)

### Negativas

1. **Disciplina obrigatória**
   - Devs acostumados a mensagens caóticas precisam aprender
   - Curva inicial ~1 hora de aprendizado
   - Código review inclui validação de commit message

2. **`--no-verify` é tentador**
   - Devs com pressa querem pular
   - Mitigação: CI roda mesmos checks, PR falha igual
   - Documentar que `--no-verify` é emergência apenas

3. **Burndown de scope enum**
   - À medida que features adicionam escopos
   - Mitigação: `foundation` scope agrega infraestrutura

## Alternatives Considered

### 1. Husky (v1 status quo)

**Prós:**
- Conhecimento difundido

**Contras:**
- Bugs em WSL/fork
- Frágil (`node_modules/.bin` hack)
- Lento

**Descartado**: Lefthook resolve todos os problemas.

### 2. Conventional Commits opcional (warn só)

```javascript
{ 'type-enum': [1, 'always', ...] }  // warn, não erro
```

**Prós:**
- Menos restritivo

**Contras:**
- Devs ignoram warns
- Changelog não funciona com mensagens caóticas
- Volta ao problema da v1

**Descartado**: Stricto necessário para automação.

### 3. Simple Git (alternativa minimalista)

Usar apenas git hooks nativos (sem manager).

**Prós:**
- Sem dependência extra

**Contras:**
- Sem cross-platform support
- Sem config centralizada
- Difícil troubleshoot

**Descartado**: Lefthook resolve.

## Related Decisions

- **ADR 0001**: Monorepo com pnpm + Turborepo
- **ADR 0003**: Biome linter (integrado em pre-commit)
- **TASK-00-04**: Implementação deste ADR
- **TASK-00-08**: Changesets (depende de Conventional Commits)

## Implementation Notes

### Checklist

- [x] Lefthook instalado (v2.1.6)
- [x] lefthook.yml configurado
- [x] commitlint instalado com config rigorosa
- [x] `prepare` script em package.json
- [x] Documentação: docs/commits.md
- [x] GitHub commit template
- [x] VSCode integration (opcional, editor independente)

### Hook timing

Local development:
```
pre-commit:   ~500ms (lint staged files)
commit-msg:   ~100ms (validate message)
pre-push:     ~2-5s  (full lint + test affected)
post-merge:   ~1-2s  (pnpm install if needed)
```

CI runs same checks independently. `--no-verify` apenas adia falha.

### Próximas ações

1. Educate team: `docs/commits.md` + workshop
2. Configurar CI gates (TASK-00-05)
3. Monitorar `--no-verify` usage (blog/metrics)

### Rollback (improvável)

Se Conventional Commits forem muito rígidos:
1. Mudar rules `type-enum` de `[2, 'always']` para `[1, 'always']` (warn)
2. Desabilitar `scope-enum` (permite qualquer scope)
3. Perda: changelog automático não funciona
4. Esforço: ~1 hora

Custo esperado: Altíssimo após primeiros 100 commits (refazer histórico é custoso).

## Migration guide

### From Husky (v1)

1. Remove Husky:
   ```bash
   pnpm remove -w husky
   rm -rf .husky
   ```

2. Install Lefthook:
   ```bash
   pnpm install
   # prepare script installs hooks automaticamente
   ```

3. Testar:
   ```bash
   git commit --allow-empty -m "test: verify lefthook"
   # deve passar se mensagem válida, falhar se inválida
   ```

---

**Autores/Revisores:**
- Igor Rezende (decision maker)
- Tech Lead (review)

**Última atualização:** 2026-04-17
