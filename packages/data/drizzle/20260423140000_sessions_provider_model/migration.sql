-- TASK-OUTLIER-07 follow-up: persistir provider + modelId por sessão.
-- Sem estas colunas, `sessions.update({ patch: { modelId, provider } })`
-- silenciosamente descartava os campos e o usuário não conseguia trocar
-- de modelo nem persistir a escolha entre reaberturas.

ALTER TABLE `sessions` ADD COLUMN `provider` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `model_id` text;
