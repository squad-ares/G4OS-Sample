CREATE TABLE `attachment_refs` (
	`id` text PRIMARY KEY,
	`hash` text NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text,
	`original_name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_attachment_refs_hash_attachments_hash_fk` FOREIGN KEY (`hash`) REFERENCES `attachments`(`hash`)
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`hash` text PRIMARY KEY,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`ref_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_accessed_at` integer NOT NULL
);
