-- Epic 11-features/03-projects: tabelas `projects` e `project_tasks`.
-- `projects` associa-se a um workspace e aponta para um rootPath no filesystem.
-- `project_tasks` são tarefas embutidas com status, priority e fractional order.

CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`root_path` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_projects_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `idx_projects_workspace` ON `projects` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_projects_slug` ON `projects` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL DEFAULT 'todo',
	`priority` text,
	`assignee_id` text,
	`due_at` integer,
	`labels` text NOT NULL DEFAULT '[]',
	`session_id` text,
	`order` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT `fk_project_tasks_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_tasks_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX `idx_project_tasks_project` ON `project_tasks` (`project_id`,`status`,`order`);--> statement-breakpoint
CREATE INDEX `idx_project_tasks_session` ON `project_tasks` (`session_id`);
