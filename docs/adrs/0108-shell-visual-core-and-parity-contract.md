# ADR 0108: Core visual do shell inspirado na V1, mas tokenizado para a V2

## Metadata

- **Numero:** 0108
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @design-system
- **Task relacionada:** TASK-10A-06 (epic 10A-ajustes)

## Contexto

A leitura manual da V1 mostrou que o problema da V2 não era "não ser idêntica". O problema era perder o espírito do produto:

- hierarquia visual forte
- densidade de informação sem parecer scaffold genérico
- shell com sidebars e painéis claramente distintos
- superfícies translúcidas e ritmo visual reconhecível

Sem uma decisão explícita, cada PR poderia empurrar a UI de volta para um visual neutro e pobre.

## Opções consideradas

### Opção A: copiar a V1 pixel a pixel

**Rejeitada:** preserva dívida histórica e impede melhorias legítimas de UX.

### Opção B: aceitar uma V2 "clean" genérica sem dívida visual

**Rejeitada:** a aplicação passa a parecer um produto diferente.

### Opção C: extrair o core visual em tokens, recipes e contracts (escolhida)

## Decisão

Opção C.

`packages/ui/src/globals.css` passa a codificar o baseline visual do shell:

- gradientes quentes/frios em camadas
- painéis translúcidos com sombra profunda
- bordas suaves e raio consistente
- contraste alto entre trilho, navegação e conteúdo principal

Os componentes do shell em `@g4os/features` adotam esse baseline em vez de estilização local ad-hoc. A documentação operacional do visual sai de `.md` solto e passa a viver em `packages/ui/README.md`.

## Consequências

**Positivas:**

- PRs futuras têm um baseline explícito de review
- a V2 preserva identidade de produto sem carregar markup legado
- sidebars, headers e status panels compartilham o mesmo vocabulário visual

**Negativas:**

- mexer em `globals.css` agora tem impacto de produto maior
- a revisão visual passa a exigir comparação com o baseline e não só "fica bonito?"

**Neutras:**

- o core visual continua evolutivo, mas não arbitrário

## Armadilhas preservadas da v1

1. UI construída por acúmulo sem tokenização. v2: baseline explícito em `@g4os/ui`.
2. Shell sem identidade consistente. v2: recipes compartilhadas.

## Referências

- `packages/ui/README.md`
- ADR-0101 (matriz de navegação do shell)

---

## Histórico de alterações

- 2026-04-21: Proposta inicial e aceita.
