# ADR 0052: Credential migration v1 → v2 (não-destrutiva + idempotente)

## Metadata

- **Numero:** 0052
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @security
- **Task relacionada:** TASK-05-03 (epic 05-credentials)

## Contexto

Usuários existentes do v1 têm `~/.g4os/credentials.enc` criptografado com o esquema custom (AES-256-GCM + PBKDF2-SHA256 100k sobre `masterKey`, header `IV[16] | salt[16] | ciphertext | tag[16]`). O v2 usa safeStorage (ADR-0051) e não consegue ler esse formato nativamente.

Incidente conhecido do v1: **migração destrutiva em release anterior apagou credenciais** de usuários no meio do update, forçando reautenticação massiva. A migração v2 não pode repetir esse erro.

Requisitos:
- Não apagar o arquivo v1 — usuário decide quando limpar.
- Dry-run obrigatório antes do apply.
- Idempotente: rodar 2x não duplica nem sobrescreve o que já está na v2.
- Falha em uma credencial não aborta as outras.
- Tokens de renovação OAuth precisam migrar junto (v1 armazenava inline, v2 separa).

## Opções consideradas

### Opção A: Migração automática no primeiro boot
**Pros:** zero fricção.
**Contras:** exige `masterKey` — se o usuário não lembra, falha silenciosamente; `masterKey` embarcada significa que qualquer processo pode decriptar o arquivo v1 localmente.

### Opção B: Migração manual opt-in via UI/CLI (aceita)
**Descrição:**
- `readV1Credentials(filePath, masterKey)` decripta respeitando o layout v1, valida auth tag, retorna objeto JSON.
- `migrateV1ToV2({ vault, masterKey, v1Path?, dryRun? })` percorre as entradas, sanitiza keys (chars fora de `/^[a-z0-9._-]+$/i` viram `_`, trunca em 100 chars), popula o vault com tag `migrated-from-v1`.
- Pula chaves já existentes (idempotência).
- Migra `refreshToken` como `<key>.refresh_token` com tag adicional `refresh-token`; falha nesse side-write é warning, não aborta o principal.
- Dry-run retorna o mesmo relatório, sem tocar no vault.

### Opção C: Re-auth manual (descartar v1)
**Pros:** simples.
**Contras:** UX péssima; reautenticar 20+ sources por usuário é trabalho operacional.

## Decisão

**Opção B.** Implementação em [`packages/credentials/src/migration/`](../../packages/credentials/src/migration/):

- [`v1-reader.ts`](../../packages/credentials/src/migration/v1-reader.ts) — decripta AES-256-GCM respeitando layout v1 (incluindo os 16 bytes de auth tag no final).
- [`migrator.ts`](../../packages/credentials/src/migration/migrator.ts) — orquestra. Entry point: `migrateV1ToV2(options)` retornando `MigrationReport { found, migrated, skipped, failed, errors }`.

UI/CLI passa explicitamente `masterKey` e decide `dryRun`. O vault v2 assume da decisão em diante; o arquivo v1 permanece em disco até o usuário apagá-lo.

## Consequências

### Positivas
- Migração auditável (log de cada chave, relatório estruturado).
- Reversível enquanto o arquivo v1 existir — se algo der errado no v2, usuário pode tentar de novo.
- Idempotente cobre reruns (usuário abre "Migrate" duas vezes, segunda não faz nada danoso).

### Negativas / Trade-offs
- Depende do usuário fornecer `masterKey`. Se ele não tem, cai em re-auth manual (Opção C como fallback — aceitável).
- Keys com chars inválidos são renomeadas sem aviso; colisão teórica após sanitização pode fundir duas credenciais diferentes numa só. Mitigação: como `sanitizeKey` preserva letras/dígitos/`.`/`-`/`_`, colisão só ocorreria com keys deliberadamente esdrúxulas — não observamos no pool do v1.

### Neutras
- Tag `migrated-from-v1` fica no metadata permanentemente; útil para auditoria, sem custo visível.

## Validação

- 5 testes unitários (`migration.test.ts`):
  - Arquivo v1 ausente → relatório zerado.
  - Dry-run não mutar o vault.
  - Idempotência (2 runs consecutivos, o segundo pula tudo).
  - Refresh tokens migram como `<key>.refresh_token`.
  - 50 credenciais v1 → v2 com 100% sucesso.
- Fixture real: testes geram blob v1 com `createCipheriv('aes-256-gcm', ...)` e `pbkdf2Sync` batendo exatamente o reader.

## Referencias

- ADR-0050 (vault API), ADR-0051 (backends)
- `STUDY/Audit/Tasks/05-credentials/TASK-05-03-migration-v1-to-v2.md`

---

## Histórico de alterações

- 2026-04-18: Proposta + aceita (TASK-05-03 landed)
