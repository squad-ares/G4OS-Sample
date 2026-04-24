-- Epic 11-features/01-sessions: lifecycle + branching + flags + labels.
-- Adiciona colunas em `sessions` (archivedAt, deletedAt, parentId,
-- branchedAtSeq, pinnedAt, starredAt, unread, projectId), cria tabelas
-- `labels` e `session_labels`, e adiciona os índices relacionados.

ALTER TABLE `sessions` ADD COLUMN `archived_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `parent_id` text REFERENCES `sessions`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `branched_at_seq` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `starred_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `unread` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `project_id` text;--> statement-breakpoint
CREATE INDEX `idx_sessions_workspace_status` ON `sessions` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_parent` ON `sessions` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_pinned` ON `sessions` (`workspace_id`,`pinned_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_deleted_at` ON `sessions` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`color` text,
	`tree_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_labels_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_labels_parent_id_labels_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `labels`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `idx_labels_workspace` ON `labels` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_labels_parent` ON `labels` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_labels_tree_code` ON `labels` (`workspace_id`,`tree_code`);--> statement-breakpoint
CREATE TABLE `session_labels` (
	`session_id` text NOT NULL,
	`label_id` text NOT NULL,
	`attached_at` integer NOT NULL,
	CONSTRAINT `session_labels_pk` PRIMARY KEY(`session_id`, `label_id`),
	CONSTRAINT `fk_session_labels_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_labels_label_id_labels_id_fk` FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `idx_session_labels_label` ON `session_labels` (`label_id`);
