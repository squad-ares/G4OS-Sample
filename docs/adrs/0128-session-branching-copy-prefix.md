# ADR 0128: Session Branching — Copy-Prefix (Estratégia A)

## Metadata

- **Numero:** 0128
- **Status:** Accepted
- **Data:** 2026-04-22
- **Autor(es):** @g4os-team
- **Stakeholders:** @tech-lead

## Contexto

Usuários querem "bifurcar" uma conversa a partir de um ponto específico (ex: "e se eu tivesse
perguntado X em vez de Y no turno 5?"). A nova sessão precisa começar com o histórico até
`branchedAtSeq` e seguir de forma independente.

Modelo de dados: sessões são sequências imutáveis de eventos em JSONL append-only (ADR-0043).
A questão é: como a sessão branch acessa os eventos do tronco até o ponto de bifurcação?

## Opções consideradas

### Opção A: Copy-Prefix (escolhida)
No momento do branch, copiar os eventos do tronco (`0..branchedAtSeq`) para um novo JSONL
da sessão branch. A branch é completamente independente do tronco após a cópia.

`parentId` e `branchedAtSeq` ficam registrados nos metadados para auditoria e para exibir
a árvore de branches na UI — mas a branch não depende do tronco para leitura de eventos.

**Pros:**
- Leitura de eventos da branch é O(1) — não precisa de JOIN com o tronco
- Branch pode ser movida/exportada independentemente
- Sem risco de corrompimento se o tronco for deletado
- Implementação simples: `branchSession()` lê eventos do EventStore do tronco e replica

**Contras:**
- Duplicação de eventos (custo de armazenamento)
- Em troncos muito longos (ex: 500 turnos), a cópia pode ser lenta

### Opção B: Shared-Prefix Pointer
A branch não copia eventos; armazena apenas `parentId` + `branchedAtSeq`.
Queries de eventos da branch fazem JOIN com o tronco até `branchedAtSeq`, depois leem o JSONL próprio.

**Pros:** Sem duplicação de dados

**Contras:**
- Leitura de eventos requer lógica de merge (eventos do tronco + eventos próprios)
- Tronco deletado invalida a branch (dependência acoplada)
- EventStore precisa de abstração nova para "sessão com prefixo remoto"
- Restore/export da branch precisa incluir o tronco

### Opção C: COW (Copy-on-Write) Lazy
Cópia adiada: branch lê do tronco até precisar escrever, aí copia o prefixo.

**Pros:** Economia de espaço para branches que nunca avançam

**Contras:**
- Complexidade alta: precisa saber se o evento é "próprio" ou "herdado"
- Inconsistência se o tronco for modificado antes da cópia lazy acontecer

## Decisão

Optamos pela **Opção A (Copy-Prefix)** porque:

1. A implementação é simples e localizada em `branchSession()` — sem mudanças no EventStore
2. Independência total elimina dependências entre sessões — seguro para delete/export
3. O custo de armazenamento é aceitável: sessões de chat raramente têm >100 turnos (eventos ~KB)

A abstração `EventStoreReader`/`EventStoreWriter` permite injetar deps em testes sem side effects.

## Consequências

### Positivas
- Branches são cidadãos de primeira classe: leitura, export, delete independente do tronco
- `branchSession()` é pura em relação ao EventStore (Reader/Writer injetáveis)
- `parentId` + `branchedAtSeq` persistidos para UI de árvore de branches

### Negativas / Trade-offs
- Duplicação de eventos (proporcional ao tamanho do prefixo copiado)
- Branch longa de tronco longo pode ser lenta para criar (bloqueante, mas raro)

### Neutras
- `listBranches(parentId)` usa índice em `parent_id` — O(log n)

## Validação

- Branch de sessão com 50 eventos no turno 30 tem exatamente 30 eventos no JSONL próprio
- Delete do tronco não afeta a branch (sem FOREIGN KEY cascadeam em parent_id via SET NULL)

## Referencias

- ADR-0043: Event store JSONL append-only
- TASK-11-01-04: Branching de sessão
- `packages/data/src/sessions/branching.ts`
- `apps/desktop/src/main/services/sessions-service.ts` (método `branch`)

---

## Histórico de alterações

- 2026-04-22: Proposta e aceita durante Epic 11-features/01-sessions
