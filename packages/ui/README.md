# @g4os/ui

## Núcleo visual

O shell da v2 não copia a v1 pixel por pixel, mas preserva o mesmo núcleo de produto:

- gradientes em camada warm/cool em vez de fundos chapados
- blocos de informação densos mas legíveis
- painéis arredondados com superfícies translúcidas
- hierarquia forte de sidebar/header
- receitas compartilhadas de sombra, borda e opacidade

A baseline de tokens vive em `src/globals.css`.

## Baseline de acessibilidade

Primitivos compartilhados de UI preservam:

- labels traduzidos para texto visível e screen-reader-only
- comportamento `focus-visible`
- restauração de foco em dialog
- estados de loading e alert amigáveis a leitor de tela

## ADRs relacionadas

- `docs/adrs/0108-shell-visual-core-and-parity-contract.md`
- `docs/adrs/0110-global-actions-and-accessibility-baseline.md`
- `docs/adrs/0102-theme-system-context-css-vars.md`
- `docs/adrs/0103-ui-package-radix-shadcn-consolidation.md`
