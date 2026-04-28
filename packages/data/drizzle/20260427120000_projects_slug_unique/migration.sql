-- CR7-20: índice único por (workspace_id, slug) em projects.
--
-- Antes: índice de busca não-único permitia dois projects no mesmo
-- workspace com slug idêntico → URL routing ambíguo (`/projects/<slug>`
-- pegava o primeiro match). Agora DB constraint impede inserts duplicados.
--
-- Drop o índice antigo (não-único, mesmo nome no schema antigo) e cria
-- o novo unique. Em DB existente que tenha duplicates, o operador precisa
-- limpar antes via script — esta migration falha se houver, alertando.

DROP INDEX IF EXISTS `idx_projects_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_workspace_slug` ON `projects` (`workspace_id`, `slug`);
