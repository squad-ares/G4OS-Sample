# ADR NNNN: [Titulo curto]

## Metadata

- **Numero:** NNNN
- **Status:** Proposed / Accepted / Deprecated / Superseded by ADR-XXXX
- **Data:** YYYY-MM-DD
- **Autor(es):** @username
- **Stakeholders:** @tech-lead, @other

## Contexto

Qual e a situação que motiva essa decisão? Qual problema estamos resolvendo?

Evidencia (métricas, bugs, feedback do time):
- ...

## Opções consideradas

### Opção A: [Nome]
**Descrição:**

**Pros:**
- ...

**Contras:**
- ...

**Custo de implementação:**

### Opção B: [Nome]
...

### Opção C: [Nome]
...

## Decisão

Optamos pela **Opção X** porque [...].

## Consequências

### Positivas
- ...

### Negativas / Trade-offs
- ...

### Neutras
- ...

## Validação

Como saberemos que essa decisão foi boa?

- Métrica 1 melhora X em Y tempo
- Revisão em [data] para avaliar

## Referencias

- Link para discussão original (issue, PR)
- Artigos / docs consultados
- ADRs relacionadas: ADR-XXXX

---

## Histórico de alterações

- YYYY-MM-DD: Proposta inicial
- YYYY-MM-DD: Aceita pelo time
- YYYY-MM-DD: [Se alterada] motivo
```

### 3. Criar `docs/adrs/README.md` (índice)

```markdown
# Architecture Decision Records (ADRs)

## O que e

ADR e um registro **imutável** de uma decisão arquitetural. Cada arquivo:

- Tem numero sequencial
- Explica contexto, opções, decisão, consequências
- Nao e editado apos aceito (apenas novo ADR pode superseder)

## Quando escrever

Escreva ADR quando:

- Escolhe uma tecnologia significativa (banco, framework, lib core)
- Muda um padrão estrutural (ex: decompõe God File)
- Toma decisão com trade-off nao-obvio
- Decisão vai afetar mais de 1 pessoa / time

**Nao escreva ADR para:**
- Decisões locais (nome de variável, estrutura de 1 arquivo)
- Decisões obvias (usar o tipo Date para datas)
- Workarounds temporários

## Como escrever

1. Copiar `_template.md` para `NNNN-titulo-slug.md`
2. Preencher com contexto real
3. Abrir PR com status "Proposed"
4. Discussão assíncrona na PR
5. Tech Lead + pelo menos 1 stakeholder aprovam
6. Merge com status "Accepted"

## Lista

| # | Titulo | Status | Data |
|---|---|---|---|
| 0001 | Monorepo structure | Accepted | 2026-04-16 |
| 0002 | TypeScript strict mode | Accepted | 2026-04-16 |
| 0003 | Biome over ESLint | Accepted | 2026-04-16 |
| 0004 | Conventional Commits | Accepted | 2026-04-16 |
| 0005 | CI architectural gates | Accepted | 2026-04-16 |
| 0006 | Package boundaries | Accepted | 2026-04-16 |
| 0007 | CODEOWNERS enforcement | Accepted | 2026-04-16 |
| 0008 | Changesets versioning | Accepted | 2026-04-16 |
| 0009 | ADR process | Accepted | 2026-04-16 |

## Status

- **Proposed:** em discussão
- **Accepted:** vigente, deve ser seguida
- **Deprecated:** nao deve mais ser seguida, mas ainda em código legado
- **Superseded by ADR-XXXX:** substituída por ADR mais recente