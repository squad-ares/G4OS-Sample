CREATE TABLE `event_checkpoints` (
	`consumer_name` text NOT NULL,
	`session_id` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`checkpointed_at` integer NOT NULL,
	CONSTRAINT `event_checkpoints_pk` PRIMARY KEY(`consumer_name`, `session_id`),
	CONSTRAINT `fk_event_checkpoints_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `messages_index` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`content_preview` text NOT NULL,
	`token_count` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_messages_index_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`last_event_sequence` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	CONSTRAINT `fk_sessions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`root_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_messages_session_sequence` ON `messages_index` (`session_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_messages_session_created` ON `messages_index` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_role` ON `messages_index` (`role`);--> statement-breakpoint
CREATE INDEX `idx_sessions_workspace` ON `sessions` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_last_message` ON `sessions` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `sessions` (`status`);--> statement-breakpoint
-- FTS5 virtual table + triggers (drizzle-kit não modela virtual tables;
-- ver packages/data/src/schema/sessions-fts.ts).
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  content_preview,
  content='messages_index',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages_index` BEGIN
  INSERT INTO messages_fts(rowid, content_preview) VALUES (new.rowid, new.content_preview);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages_index` BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview) VALUES('delete', old.rowid, old.content_preview);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE ON `messages_index` BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview) VALUES('delete', old.rowid, old.content_preview);
  INSERT INTO messages_fts(rowid, content_preview) VALUES (new.rowid, new.content_preview);
END;