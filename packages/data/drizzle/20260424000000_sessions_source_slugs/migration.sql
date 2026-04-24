-- TASK-OUTLIER-10: persistir estado de sources por sessão.
-- `enabled` — slugs ativos explicitamente nesta sessão (subset do workspace).
-- `sticky` — slugs mountados via `activate_sources` pelo agent; persistem
--   entre reabrir sessão até serem deselecionados/rejeitados/incompatíveis.
-- `rejected` — slugs vetados pelo usuário em chat ("não use HubSpot"); planner
--   não deve mountar enquanto rejeitado (override explícito via UI limpa).
-- Todos JSON arrays de string. Default '[]' para migrar sessões antigas.

ALTER TABLE `sessions` ADD COLUMN `enabled_source_slugs_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `sticky_source_slugs_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `rejected_source_slugs_json` text NOT NULL DEFAULT '[]';
