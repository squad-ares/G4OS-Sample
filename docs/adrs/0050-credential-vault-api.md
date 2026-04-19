# ADR 0050: Credential Vault API (mutex + backups + metadata)

## Metadata

- **Numero:** 0050
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @security
- **Task relacionada:** TASK-05-01 (epic 05-credentials)

## Contexto

Três sintomas de v1 que precisamos eliminar:

1. **Corrida de escrita.** 93 arquivos do v1 escreviam em `credentials.enc` sem coordenação. Updates concorrentes perdiam dados.
2. **Corrupção silenciosa.** Crash no meio do write deixava o arquivo ilegível; reautenticação manual era a única saída.
3. **Sem expiração ativa.** Tokens OAuth expirados ficavam servidos até o usuário perceber o erro em runtime.

O vault v2 precisa ser o **único** ponto de escrita do armazenamento seguro, agnóstico a backend (para permitir in-memory em testes e safeStorage em prod — ver ADR-0051).

## Opções consideradas

### Opção A: Manter acesso direto a `credentials.enc`
**Pros:** zero mudança estrutural.
**Contras:** mantém exatamente os três sintomas. Inviável.

### Opção B: Queue global + writes em lote
**Pros:** serializa escritas.
**Contras:** não resolve corrupção (sem backup), não resolve expiração (sem metadata), adiciona latência em leituras.

### Opção C: Gateway único `CredentialVault` (aceita)
**Descrição:**
- `async-mutex` serializa `set`/`delete`/`rotate` — elimina a race.
- Cada escrita copia o valor anterior para `<key>.backup-<ts>`; retenção fixa em 3 (`BACKUP_RETENTION`).
- Metadata separada em `<key>.meta` (`createdAt`/`updatedAt`/`expiresAt`/`tags`).
- `get` em credencial com `expiresAt < now` retorna `credential.expired` e auto-deleta.
- Validação determinística: key `/^[a-z0-9._-]+$/i` (≤100 chars); value 1..1_000_000 chars.
- Backend abstrato `IKeychain` (ver ADR-0051) — vault nunca manipula arquivo/keychain diretamente.

## Decisão

**Opção C.** Implementação em [`packages/credentials/src/vault.ts`](../../packages/credentials/src/vault.ts). API pública:

```ts
class CredentialVault {
  constructor(keychain: IKeychain)
  get(key): Promise<Result<string, CredentialError>>
  set(key, value, { expiresAt?, tags? }): Promise<Result<void, CredentialError>>
  delete(key): Promise<Result<void, CredentialError>>
  rotate(key, newValue): Promise<Result<void, CredentialError>>
  list(): Promise<Result<readonly CredentialMeta[], CredentialError>>
  exists(key): Promise<boolean>
}
```

tRPC router em `packages/ipc/src/server/routers/credentials-router.ts` expõe `get/set/delete/list/rotate` como procedures autenticadas. Qualquer outra camada que precise ler/escrever credencial vai via vault — nunca direto.

## Consequências

### Positivas
- Zero-loss em escritas concorrentes (testado com 100 writes paralelos na mesma chave).
- Corrupção recupera via `<key>.backup-<ts>`; histórico de 3 versões por chave cobre rollback manual.
- Tokens expirados não contaminam o produto — `get` filtra e limpa.

### Negativas / Trade-offs
- Backup rotation é O(N) por escrita (lista + sort + delete dos antigos). Aceitável para o volume esperado (<100 credenciais por usuário).
- `BACKUP_RETENTION=3` é constante; se produto pedir histórico maior, exige novo ADR.

### Neutras
- `list()` filtra `.meta` e `.backup-` para não poluir UI; consumidores não precisam conhecer a convenção.

## Validação

- 7 testes unitários diretos (`vault.test.ts`): set/get, key inválida, expiração auto-delete, 100 writes concorrentes sem perda, retenção ≤3 após 8 rotações, list sem meta/backup, delete remove valor+meta.
- Vault é exercitado indiretamente por migração e rotation (14 testes adicionais).

## Referencias

- ADR-0011 (Result), ADR-0012 (Disposable), ADR-0051 (backends), ADR-0052 (migração), ADR-0053 (rotation)
- `STUDY/Audit/Tasks/05-credentials/TASK-05-01-vault-api.md`

---

## Histórico de alterações

- 2026-04-18: Proposta + aceita (TASK-05-01 landed)
