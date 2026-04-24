# ADR 0107: Shell autenticado com matriz canônica de navegação antes das features

## Metadata

- **Numero:** 0107
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @product-shell
- **Task relacionada:** TASK-10A-05 (epic 10A-ajustes)

## Contexto

A v1 concentrava muitas entradas globais no app shell, mas sem um contrato único. O risco na v2 era repetir o problema em versão menor: cada feature do épico 11 poderia criar sua própria entrada, próprio empty state e própria convenção de rota.

Requisitos:

- um registry único de páginas globais do shell
- placeholders navegáveis para superfícies ainda não implementadas
- contrato estável para `label`, `description`, `route` e `status`
- layout compartilhado para header, navegação e superfícies de detalhe

## Opções consideradas

### Opção A: deixar cada feature registrar sua navegação quando chegar

**Rejeitada:** empurra debt estrutural para o épico 11 e espalha decisão de shell por vários módulos.

### Opção B: criar a matriz agora e permitir placeholders tipados (escolhida)

O shell passa a ter um registry central (`navigation.ts`) e uma família de componentes reutilizáveis para páginas vazias e contratos pendentes.

## Decisão

Opção B.

`packages/features/src/shell/navigation.ts` é a fonte única de verdade para os navegadores:

- `workspaces`
- `sources`
- `projects`
- `marketplace`
- `company-context`
- `skills`
- `workflows`
- `scheduler`
- `vigia`
- `news`
- `settings`
- `support`

`AppShell` agora compõe:

- trilho de workspaces
- painel de navegação global
- header com contexto da página atual
- área principal com scaffold padronizado

Páginas ainda não implementadas usam `ShellPlaceholderPage`, garantindo rota, contract badge, descrição e shortcut hints antes da lógica completa da feature existir.

## Consequências

**Positivas:**

- feature nova entra em uma malha de navegação pronta
- deep-links deixam de depender de estado implícito do shell
- empty/loading/error states passam a ter aparência e semântica coerentes

**Negativas:**

- o shell mostra mais superfícies "planned" antes da feature body existir
- toda alteração de navegação agora exige passar pelo registry central

**Neutras:**

- o shell continua enxuto, mas já espelha o alcance funcional esperado da v1

## Armadilhas preservadas da v1

1. Registro de páginas em múltiplos lugares. v2: `navigation.ts` central.
2. Empty states inventados por feature. v2: scaffold compartilhado.
3. Header sem contrato da página atual. v2: título e descrição derivam da navegação ativa.

## Referências

- `packages/features/README.md`
- ADR-0104 (global actions + accessibility baseline)

---

## Histórico de alterações

- 2026-04-21: Proposta inicial e aceita.
