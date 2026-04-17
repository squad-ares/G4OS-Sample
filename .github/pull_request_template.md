## Descricao

<!-- O que esta PR faz e por que -->

## Task vinculada

- TASK-XX-YY

## Tipo de mudanca

- [ ] feat (nova feature)
- [ ] fix (bug fix)
- [ ] refactor (sem mudanca funcional)
- [ ] docs
- [ ] test
- [ ] chore

## Checklist

### Codigo
- [ ] Codigo segue padroes do projeto (lint + typecheck verdes)
- [ ] Nenhum arquivo > 500 linhas
- [ ] Sem `any`, `console.*`, `@ts-ignore`

### Testes
- [ ] Cobertura ≥ 80% no dominio tocado
- [ ] Testes passam em CI (mac/win/linux)
- [ ] E2E atualizado se fluxo de usuario mudou

### Documentacao
- [ ] README do pacote atualizado se API publica mudou
- [ ] ADR escrita se decisao arquitetural
- [ ] Changelog entry via `pnpm changeset`

### Seguranca (se aplicavel)
- [ ] Sem secrets commitados
- [ ] Inputs validados com Zod
- [ ] Security-lead aprovou (auth/credentials/crypto)

## Armadilhas da v1 evitadas

<!-- Referenciar armadilhas listadas na task que esta PR esta evitando -->

## Como testar

```bash
# Comandos para reviewer reproduzir
```