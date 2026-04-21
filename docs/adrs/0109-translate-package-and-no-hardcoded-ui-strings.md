# ADR 0109: Package de tradução + política de zero strings diretas em UI monitorada

## Metadata

- **Numero:** 0109
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @ux-platform
- **Task relacionada:** TASK-10A-07 (epic 10A-ajustes)

## Contexto

A V1 já tinha locale e dicionários, mas a V2 ainda corria o risco de reintroduzir strings diretas em login, shell e componentes-base. Isso quebraria dois objetivos do rewrite:

- nascer bilíngue desde o primeiro dia
- evitar dívida invisível que aparece só quando uma segunda língua tenta entrar

Requisitos:

- dicionários tipados
- provider único de locale
- uso em login, onboarding, shell e settings
- check automático contra strings visíveis novas em paths monitorados

## Opções consideradas

### Opção A: traduzir pontualmente só as telas "principais"

**Rejeitada:** cria uma mistura onde componentes-base continuam emitindo texto direto.

### Opção B: package dedicado + check de strings monitoradas (escolhida)

## Decisão

Opção B.

`packages/translate` passa a concentrar:

- chaves tipadas
- `pt-BR` e `en-US`
- helpers de formatação
- resolução/persistência de locale

`packages/ui/src/translate/translate-provider.tsx` fornece `useTranslate()`, e `scripts/check-i18n-strings.ts` passa a bloquear JSX text e atributos visíveis (`aria-label`, `placeholder`, `title`, `alt`) em:

- `apps/desktop/src/renderer`
- `packages/features/src`
- `packages/ui/src`

## Consequências

**Positivas:**

- shell e auth ficam i18n-ready por contrato, não por disciplina informal
- componentes compartilhados como `Dialog` e `Spinner` deixam de carregar texto fixo
- o lint raiz passa a pegar regressões de internacionalização cedo

**Negativas:**

- há mais atrito inicial para prototipar UI rápido
- o check é intencionalmente conservador e pode exigir pequenos ajustes de allowlist no futuro

**Neutras:**

- o foco atual continua em duas línguas; ampliar isso depois não muda o contrato básico

## Armadilhas preservadas da v1

1. Strings hardcoded espalhadas. v2: caminhos monitorados e check dedicado.
2. Locale parcial. v2: provider montado desde login até settings.

## Referências

- `packages/translate/README.md`
- ADR-0104 (actions + accessibility baseline, também consome dicionário)

---

## Histórico de alterações

- 2026-04-21: Proposta inicial e aceita.
