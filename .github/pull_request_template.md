## Descrição

<!-- O que esta PR faz e por que -->

## Task vinculada

- TASK-XX-YY

## Tipo de mudança

- [ ] feat (nova feature)
- [ ] fix (bug fix)
- [ ] refactor (sem mudança funcional)
- [ ] docs
- [ ] test
- [ ] chore

## Checklist

### Código
- [ ] Código segue padrões do projeto (lint + typecheck verdes)
- [ ] Nenhum arquivo > 500 linhas
- [ ] Sem `any`, `console.*`, `@ts-ignore`

### Testes
- [ ] Cobertura ≥ 80% no domínio tocado
- [ ] Testes passam em CI (mac/win/linux)
- [ ] E2E atualizado se fluxo de usuário mudou

### Documentacao
- [ ] README do pacote atualizado se API publica mudou
- [ ] ADR escrita se decisão arquitetural
- [ ] Changelog entry via `pnpm changeset`

### Segurança (se aplicável)
- [ ] Sem secrets commitados
- [ ] Inputs validados com Zod
- [ ] Security-lead aprovou (auth/credentials/crypto)

## Armadilhas da v1 evitadas

<!-- Referenciar armadilhas listadas na task que esta PR esta evitando -->

## Como testar

```bash
# Comandos para reviewer reproduzir
```