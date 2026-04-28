-- CR6-02 + CR7-02 — adiciona FK + ON DELETE CASCADE em attachment_refs.session_id
-- com backup explícito das refs órfãs em `attachment_refs_orphaned`.
--
-- Problema antes deste fix: ao deletar/archivar uma sessão, os attachment_refs
-- ficavam órfãos. Como o refcount em `attachments` continuava > 0 (refs ainda
-- apontavam pro hash), o GC nunca removia o blob de disco — leak silencioso.
--
-- SQLite não suporta `ALTER TABLE ADD CONSTRAINT`, então fazemos o pattern
-- canônico: criar tabela nova com a constraint, copiar dados, drop da
-- antiga, rename.
--
-- CR7-02: refs órfãs (sessions deletadas mas refs sobreviventes) eram
-- silenciosamente DESCARTADAS pela versão anterior desta migration. Agora
-- copiamos elas para `attachment_refs_orphaned` antes — operador pode
-- consultar disponibilidade de blobs zumbis e rodar GC manual via
-- AttachmentGateway sem perder rastreabilidade.

CREATE TABLE IF NOT EXISTS `attachment_refs_orphaned` (
	`id` text PRIMARY KEY,
	`hash` text NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text,
	`original_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`migrated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `attachment_refs_orphaned` (id, hash, session_id, message_id, original_name, created_at, migrated_at)
SELECT r.id, r.hash, r.session_id, r.message_id, r.original_name, r.created_at, unixepoch() * 1000
FROM `attachment_refs` r
WHERE r.session_id NOT IN (SELECT id FROM `sessions`);
--> statement-breakpoint
CREATE TABLE `attachment_refs_new` (
	`id` text PRIMARY KEY,
	`hash` text NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text,
	`original_name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_attachment_refs_new_hash_attachments_hash_fk` FOREIGN KEY (`hash`) REFERENCES `attachments`(`hash`),
	CONSTRAINT `fk_attachment_refs_new_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `attachment_refs_new`
SELECT r.* FROM `attachment_refs` r
WHERE r.session_id IN (SELECT id FROM `sessions`);
--> statement-breakpoint
DROP TABLE `attachment_refs`;
--> statement-breakpoint
ALTER TABLE `attachment_refs_new` RENAME TO `attachment_refs`;
