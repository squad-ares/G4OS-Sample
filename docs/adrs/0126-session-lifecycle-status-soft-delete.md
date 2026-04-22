# ADR 0126: Session Lifecycle — Status Enum + Timestamps + Soft Delete 30d

## Metadata

- **Numero:** 0126
- **Status:** Accepted
- **Data:** 2026-04-22
- **Autor(es):** @g4os-team
- **Stakeholders:** @tech-lead

## Contexto

O v1 não tinha estados de sessão além de "ativa". Usuários perdiam sessões acidentalmente
(sem lixeira), e a busca global incluía sessões que o usuário queria ignorar. Eram necessários:

1. Arquivar sessão (mover para fora da lista principal sem destruir)
2. Apagar sessão (com janela de recuperação)
3. Restaurar sessão arquivada ou apagada

Evidência:
- Pedido recorrente de clientes: "apaguei sem querer, perdi tudo"
- Busca global retornando sessões obsoletas como resultado

## Opções consideradas

### Opção A: Status enum + timestamps de lifecycle
Adicionar coluna `status TEXT NOT NULL DEFAULT 'active'` com valores `'active'|'archived'|'deleted'`,
e colunas `archived_at INTEGER` e `deleted_at INTEGER` para rastrear quando a transição ocorreu.
Soft delete: sessões com `status = 'deleted'` ficam 30 dias antes de serem purgadas pelo scheduler.

**Pros:**
- Um único índice em `(workspace_id, status, updated_at)` cobre todos os filtros de lifecycle
- Timestamps permitem UI de "será removido em X dias"
- Restore simples: `UPDATE SET status='active', deleted_at=NULL, archived_at=NULL`
- Purge periódico via `SessionsCleanupScheduler` — não bloqueia o fluxo normal

**Contras:**
- Sempre retorna dados mesmo de sessões deletadas até o purge
- Necessita gate de filtro em todas as queries de lista

### Opção B: Tabelas separadas para archive/trash
Mover sessões para tabelas `sessions_archived` e `sessions_trash`.

**Pros:** Separação física, queries de lista não precisam filtrar

**Contras:**
- JOINs complexos para busca global e restore
- Schema mais difícil de manter
- Migração de dados cara em operações de archive/restore

### Opção C: Somente flag booleano `is_deleted`
Um campo `is_deleted INTEGER NOT NULL DEFAULT 0`.

**Pros:** Minimalista

**Contras:**
- Sem suporte a archive
- Sem timestamp para janela de restore
- Sem suporte a UI de "vence em X dias"

## Decisão

Optamos pela **Opção A** porque centraliza o estado em uma única coluna indexada, suporta os
três estados necessários (active/archived/deleted), e o `SessionsCleanupScheduler` faz o
purge físico assincronamente sem impactar a UX.

A janela de 30 dias para restore de sessões deletadas foi escolhida por analogia com Google
Drive e GitHub (itens no lixo permanecem 30 dias).

## Consequências

### Positivas
- Restore é reversível e não destrutivo
- Scheduler de purge é isolado (`extends DisposableBase`) e observa o teto de 30d
- Filtro de lifecycle em `SessionsRepository.buildWhereClauses` centraliza a lógica

### Negativas / Trade-offs
- Todas as queries de sessão precisam incluir `AND status = 'active'` (ou o filtro correto)
- O scheduler precisa rodar em algum momento para fazer o purge físico

### Neutras
- Evento de lifecycle publicado no JSONL antes de atualizar o SQLite (consistente com ADR-0043)

## Validação

- Sessões com `status = 'deleted'` não aparecem na lista principal (filtro automático)
- Sessões restauradas retornam para `status = 'active'` com timestamps zerados
- Scheduler purga apenas sessões com `deleted_at < now - 30d`

## Referencias

- ADR-0043: Event store JSONL append-only
- TASK-11-01-06: Archive/delete/restore
- `packages/data/src/sessions/repository.ts`
- `apps/desktop/src/main/services/sessions-cleanup-scheduler.ts`

---

## Histórico de alterações

- 2026-04-22: Proposta e aceita durante Epic 11-features/01-sessions
