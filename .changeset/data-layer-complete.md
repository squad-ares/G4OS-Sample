---
'@g4os/data': minor
'@g4os/desktop': minor
---

Data-layer TASKs 04-03 a 04-06: pipeline de migrations Drizzle com backup pré-migration e helper `db:migrate:status`, event-sourcing JSONL por sessão (`SessionEventStore`, replay + checkpoints multi-consumer, projection `sessions`/`messages_index`/FTS5), attachment storage content-addressed (SHA-256, 2-char prefix, dedup + refcount + GC via `AttachmentGateway`), e backup/restore ZIP v1 (manifest Zod, `exportWorkspaceBackup`/`restoreWorkspaceBackup`, `BackupScheduler` com retenção 7/4/3). ADRs 0043 (JSONL), 0044 (attachments), 0045 (backup).
