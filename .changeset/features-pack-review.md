---
'@g4os/features': patch
---

Pack-review features: snapshot do `categories.test.ts` reconciliado com a inclusão da categoria `services`.

A categoria `services` foi adicionada ao `SETTINGS_CATEGORIES` no commit `bd20855 feat(desktop): Services status screen with real HTTP connectivity probing` mas o teste de paridade `'split ready/planned está estável'` e o assert de count (`SETTINGS_CATEGORIES.toHaveLength`) ficaram com o snapshot anterior (14 entries / sem `services`). Atualização cosmética do teste — a feature já estava em produção e funcional, este commit só destrava o gate `pnpm test` no `@g4os/features`.
