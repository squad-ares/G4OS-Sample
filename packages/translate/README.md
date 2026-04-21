# @g4os/translate

## Propósito

`@g4os/translate` é a fonte canônica de dicionários de locale, chaves de tradução e helpers de formatação na v2.

A fundação do shell envia apenas:

- `pt-BR`
- `en-US`

## Regras

- Novas strings de UI precisam passar por `t(...)`.
- `renderer`, `packages/features` e `packages/ui` são monitorados pelo `scripts/check-i18n-strings.ts`.
- Formatação sensível ao locale deve usar `formatDate`, `formatNumber` ou `formatRelativeTime`.
- Textos faltantes de features ficam nos dicionários, nunca inline nos componentes.

## Integração

- `packages/ui/src/translate/translate-provider.tsx` expõe `useTranslate()`.
- `apps/desktop/src/renderer/main.tsx` monta o provider para login, onboarding e o shell autenticado.
- `packages/features` consome chaves para a matriz de navegação e o registry de ações.

## ADR relacionada

- `docs/adrs/0109-translate-package-and-no-hardcoded-ui-strings.md`
