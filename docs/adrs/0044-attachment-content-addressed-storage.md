# ADR 0044: Attachment storage content-addressed com refcount + GC

## Metadata

- **Numero:** 0044
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-05)
- **Dependências:** ADR-0040a (node:sqlite), ADR-0042 (drizzle beta), ADR-0043 (event store)

## Contexto

V1 persistia anexos de duas formas incoerentes:

- **Base64 dentro do JSONL** — transcripts de sessões com PDFs grandes passavam 50MB, parse custava segundos, FTS ingeria lixo.
- **Path absoluto para arquivo do usuário** — quebrava no backup, quebrava ao mover a máquina, quebrava em multi-workspace.

Consequências observadas: sem dedup (usuário arrasta o mesmo PDF 10x = 10 cópias na transcript), sem GC (pastas temporárias cresciam infinitamente), impossível separar "apagar sessão" de "apagar blob".

## Opções consideradas

### Opção A — Manter base64 inline, aumentar limites

Não resolve nenhum dos problemas. Descartada.

### Opção B — Filesystem com filename = `<uuid>.<ext>`

**Pros:** simples.
**Contras:** sem dedup natural; sem jeito de detectar duplicatas sem scan de conteúdo.

### Opção C (escolhida) — Content-addressed: `<baseDir>/<hash[0:2]>/<hash[2:]>`

**Descrição:**
- Path canônico é derivado do SHA-256 do conteúdo.
- Prefixo de 2 chars evita > ~65k arquivos em um único diretório (limite prático em FAT32/NTFS/ext4 para listagem rápida).
- Tabela `attachments(hash PRIMARY KEY, size, mime_type, ref_count, created_at, last_accessed_at)` guarda metadados.
- Tabela `attachment_refs(id, hash → attachments, session_id, message_id, original_name, created_at)` liga blobs a mensagens; um blob pode ter N refs.

## Decisão

Adotamos **Opção C** com as seguintes regras de coerência:

### Invariantes

1. `attachments.refCount` é igual ao número de `attachment_refs` vivos que apontam para aquele hash.
2. Filesystem write acontece **antes** da transação SQL (`store()` é idempotente por hash). Se o commit SQL falhar, o blob fica órfão e é recolhido pelo `gc()`.
3. `delete` físico do blob acontece **depois** do commit do `detach()` (fora da transação SQL). Se o processo morrer entre commit e unlink, o GC também recolhe.
4. Transações usam o modo síncrono do `drizzle-orm/node-sqlite` (ADR-0040a).

### API pública

- `AttachmentStorage.store(buffer) → { hash, size }` — dedup natural via `stat()`; só escreve se não existir.
- `AttachmentStorage.{read,exists,delete,path}` — operações puras sobre filesystem.
- `AttachmentGateway.attach(params) → { refId, hash, size }` — upsert em `attachments` com `refCount += 1` e insert em `attachment_refs`.
- `AttachmentGateway.detach(refId)` — decrementa refCount; se chegar a 0, deleta linha + blob físico.
- `AttachmentGateway.gc(ttlMs = 30d)` — remove blobs órfãos (`refCount <= 0 AND lastAccessedAt < cutoff`).
- `AttachmentGateway.listReferencedHashesForSessions(sessionIds)` — usado por `exportWorkspaceBackup` (ADR-0045).

### Layout

```
<appPaths.data>/attachments/ab/cdef1234...   # hash = "abcdef1234..."
```

## Consequências

### Positivas

- Mesmo PDF anexado 10x = 1 arquivo em disco + 10 refs.
- Remover sessão/mensagem dispara detach automático do ref; blob só morre quando último ref some.
- GC é uma varredura barata (`refCount = 0 AND lastAccessedAt < cutoff`).
- Backup usa `listReferencedHashesForSessions` para incluir apenas blobs vivos (não empacota lixo antigo).

### Negativas / Trade-offs

- Um blob pode ficar órfão entre o write físico e o commit SQL (janela de crash). Mitigado pelo GC; nunca causa perda de dado.
- Custo de hashing é pago por attach (SHA-256 em Node é ~500MB/s em hardware moderno; aceitável para anexos < 100MB).

### Neutras

- Nome original do arquivo vive em `attachment_refs.originalName` — UI mostra esse nome, filesystem usa hash.

## Validação

- 11 testes de unidade cobrem: hash/path determinístico, dedup (10x mesmo buffer = 1 arquivo), read/delete, attach/detach com refcount, GC de órfãos e `listReferencedHashesForSessions` (distinct).
- Próxima validação: integração com backup (TASK-04-06) e com renderer (TASK-11).

## Referências

- Tarefa: `STUDY/Audit/Tasks/04-data-layer/TASK-04-05-attachment-storage.md`
- ADRs relacionadas: ADR-0040a, ADR-0042, ADR-0043, ADR-0045
- Prior art: Git (object store content-addressed), IPFS, `sharded_dir` pattern em sistemas de cache.

---

## Histórico de alterações

- 2026-04-18: Proposta inicial + aceita (TASK-04-05).
