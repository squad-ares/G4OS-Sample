# ADR 0045: Backup/restore workspace — formato ZIP v1 + scheduler com retention 7/4/3

## Metadata

- **Numero:** 0045
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 04-data-layer (TASK-04-06)
- **Dependências:** ADR-0043 (event store), ADR-0044 (attachments)

## Contexto

V1 não tinha backup/restore oficial. Usuários perderam dados em três cenários reportados:

1. Upgrade de OS que renomeou `~/.g4os`.
2. Migração de Mac para Windows (sem plano de export).
3. Crash de disco sem snapshots.

A arquitetura v2 já produz eventos imutáveis (ADR-0043) e blobs content-addressed (ADR-0044). Isso permite backup **determinístico e portável** — sem depender de dump binário do SQLite, sem depender do layout interno da projection.

## Opções consideradas

### Opção A — Dump do arquivo `app.db` + `tar` da pasta do workspace

**Pros:** simples.
**Contras:**
- Depende do schema do SQLite (quebra a cada migration).
- Não diferencia blobs vivos de órfãos — empacota lixo.
- Sem manifest — impossível evoluir formato.

### Opção B — SQL dump parcial + sessions + attachments

Proposta original da task. Contra: `data.sql` duplica informação já contida nos eventos e acopla backup ao schema da projection.

### Opção C (escolhida) — ZIP com manifest + eventos JSONL + blobs referenciados; projection reconstruída via replay

**Layout interno do ZIP:**

```
manifest.json                       # BackupManifestSchema (Zod) — version 1
sessions/<sessionId>/events.jsonl   # log canônico (idêntico ao filesystem)
attachments/<hash>                  # blobs referenciados (sem extensão)
```

**Manifest v1:**

```jsonc
{
  "version": 1,
  "exportedAt": 1760000000000,
  "workspaceId": "...",
  "workspaceName": "...",
  "sessionIds": ["...", "..."],
  "attachmentHashes": ["...", "..."],
  "appVersion": "0.1.0" // opcional
}
```

## Decisão

Adotamos **Opção C**.

### Export (`exportWorkspaceBackup`)

1. Query `workspaces` + `sessions` do workspace alvo.
2. `gateway.listReferencedHashesForSessions(sessionIds)` seleciona apenas blobs vivos.
3. Monta `BackupManifest` + valida via `BackupManifestSchema.parse` (indiretamente ao escrever).
4. `archiver('zip', { zlib: { level: 9 } })` stream-grava:
   - `manifest.json` (pretty JSON)
   - `sessions/<sid>/events.jsonl` (read direto do filesystem)
   - `attachments/<hash>` (read de `storage.path(hash)`)

### Import (`restoreWorkspaceBackup`)

1. Lê o ZIP via `yauzl` em modo lazy-entries.
2. Parseia `manifest.json` com `BackupManifestSchema.safeParse`.
3. Para cada `sessionId`: escreve `<workspaceRoot>/sessions/<sid>/events.jsonl`.
4. Para cada `hash`: `storage.store(buffer)` (dedup natural).
5. Para cada sessão: `rebuildProjection(db, eventStore, sessionId)` reconstrói `sessions` + `messages_index` + `event_checkpoints`.
6. `failIfExists: true` rejeita quando o workspace já existe na DB alvo; padrão é idempotente (overwrite).

**Importante:** o backup **não restaura a linha `workspaces`** — isso é responsabilidade do caller, porque a semântica (novo id vs. merge) depende do fluxo de UI.

### Compatibilidade de versão

- Manifest com `version !== 1` é rejeitado com erro explícito.
- Futuras versões **acrescentam** branches em `parseManifest`, nunca editam o branch v1.

### Scheduler (`BackupScheduler`)

- Intervalo default 24h (`setInterval`); um ciclo bloqueia o próximo via flag `running`.
- Lista workspaces, chama `exportWorkspaceBackup` para cada um, escreve em `<data>/auto-backups/<workspaceId>-<ts>.zip`.
- **Retention 7/4/3:** mantém 7 mais recentes (diário), 1 por bucket de 7 dias nas últimas 4 semanas, 1 por bucket de 30 dias nos últimos 3 meses.
- Erro em um workspace não aborta os outros.

## Consequências

### Positivas

- Formato portável entre plataformas (mesmo ZIP roda em Mac, Windows, Linux).
- Manifest versionado permite evoluir sem quebrar backups antigos.
- Projection é reconstruída pelo replay — backup independe do schema SQLite da versão em que foi criado.
- `failIfExists=false` torna restore idempotente (útil para testes E2E e recuperação automatizada).
- Retenção 7/4/3 é estratégia clássica (VSCode, Time Machine) — cobre cenários de regressão recente, semanal e mensal sem inflar armazenamento.

### Negativas / Trade-offs

- Backup é um snapshot full — sem incrementais. Aceitável porque sessões típicas < 10MB (ADR-0043) e zlib level 9 comprime agressivamente.
- Replay em import pode ser lento para sessões gigantes. Mitigação via snapshotting é trabalho futuro.

### Neutras

- `AppDb` é injetado (não instanciado pelo backup) — permite testes isolados e reutiliza o pool de conexão do app.

## Validação

- 4 testes de unidade para backup:
  - Export gera ZIP com manifest correto.
  - Round-trip: export → workspace novo → restore → projection idêntica.
  - Manifest com versão desconhecida é rejeitado.
  - `failIfExists=true` rejeita workspace duplicado.
- Scheduler é coberto por inspeção de código + teste integrado subsequente (TASK futura).

## Referências

- Tarefa: `STUDY/Audit/Tasks/04-data-layer/TASK-04-06-backup-restore.md`
- ADRs relacionadas: ADR-0043, ADR-0044
- Libs: `archiver@7` (write stream), `yauzl@3` (random-access read) — padrão no ecossistema Node para ZIP.

---

## Histórico de alterações

- 2026-04-18: Proposta inicial + aceita (TASK-04-06).
