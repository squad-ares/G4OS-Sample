# @g4os/features

## Fundação do Shell

A fundação do shell centraliza três contratos antes das features do TASK-11 aterrissarem:

- matriz de navegação em `src/shell/navigation.ts`
- registry de ações globais em `src/shell/actions.ts`
- scaffolds reutilizáveis de página/status em `src/shell/components/shell-page.tsx`

Features novas devem plugar no shell existente em vez de inventar:

- entradas ad-hoc no navegador
- superfícies próprias de empty/loading/error
- sistemas isolados de atalhos

## Páginas globais atuais

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

## Registry de ações

É a fonte única de verdade para:

- atalhos de teclado
- itens do command palette
- superfícies geradas de ajuda de atalhos

## ADRs relacionadas

- `docs/adrs/0107-authenticated-shell-navigation-matrix.md`
- `docs/adrs/0110-global-actions-and-accessibility-baseline.md`
- `docs/adrs/0104-platform-provider-renderer-isolation.md`
- `docs/adrs/0105-app-shell-auth-guard-layout.md`
