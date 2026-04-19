# ADR 0010: Event-sourced sessions

## Metadata

- **Numero:** 0010
- **Status:** Proposed
- **Data:** 2026-04-17
- **Autor(es):** @squad-ares
- **Stakeholders:** @frontend-lead, @backend-lead, @qa-lead
- **Épico:** 01-kernel (TASK-01-01)

## Contexto

Sessions em v1 eram "current state only" — armazenadas como snapshot no arquivo JSON. Isso causou:

1. **Perda de histórico:** nenhuma auditoria de quando/como a session mudou
2. **Inconsistência em sync:** divergência entre local e cloud sem forma de reconciliar
3. **Dificuldade em undo/replay:** não há trail de eventos para reverter estado ruim
4. **Debugging difícil:** ao quebrar uma session, sem logs estruturados é impossível saber em qual mensagem começou

Em v2, queremos sessions baseadas em **event sourcing**:

```
┌──────────────────┐
│  Session Events  │  (append-only log)
│  1. created      │
│  2. msg_added    │
│  3. msg_edited   │
│  4. archived     │
└──────────────────┘
         ↓
    Apply events
         ↓
┌──────────────────┐
│ Current State    │  (derived)
│  messages[]      │
│  status          │
│  metadata        │
└──────────────────┘
```

**Benefícios:**
- Auditoria completa: cada evento carrega `timestamp` e `actor`
- Replay fácil: reaplicar eventos desde evento N
- Sync automático: enviar apenas novos eventos para nuvem
- Debugging: inspecionar trail de eventos em lugar de snapshot

**Evidência:**
- Session corrompida em v1 sem forma de diagnosticar
- Usuários em instâncias offline/online com sessions divergentes
- Changesets pede event-driven approach para changelog

## Opções consideradas

### Opção A: Event sourcing completo (CQRS)
**Descrição:**
Manter event log imutável + snapshots periódicos. Reconstruir estado via `reducer` a partir de events.

Implementação:
```ts
type SessionEvent = 
  | { type: 'created'; sessionId; timestamp; createdBy }
  | { type: 'message_added'; messageId; message; timestamp }
  | { type: 'message_edited'; messageId; newContent; timestamp }
  | { type: 'archived'; timestamp; reason }

type Session = applyEvents(events: SessionEvent[]): CurrentState
```

**Pros:**
- Auditoria completa
- Replay / undo trivial
- Paralelizável com snapshots para performance
- Sync automático (apenas novos events)

**Contras:**
- Mais complexo de implementar
- Precisa de migration v1 → v2 (converter snapshots em eventos iniciais)
- Storage overhead se muitos events

**Custo de implementação:** M (3-5 dias incluindo migration)

### Opção B: Snapshot-only (v1 status quo)
**Descrição:**
Continuar com estado snapshottado. Adicionar timestamp no snapshot para saber quando mudou.

**Pros:**
- Menos complexo
- Menos storage

**Contras:**
- Sem auditoria granular
- Sync ainda é snapshot-based (problema em offline/online)
- Sem replay fácil

**Custo de implementação:** S (0 dias, ja temos)

### Opção C: Hybrid (events + snapshots, sem applyEvents reducer)
**Descrição:**
Manter event log para auditoria, mas estado também é armazenado no snapshot. Não reconstruir estado a partir de events, apenas usar log como audit trail.

**Pros:**
- Auditoria
- Menos complexidade que CQRS

**Contras:**
- Divergência possível entre log e snapshot
- Não ganha replay/undo

**Custo de implementação:** S (1-2 dias)

## Decisão

Optamos pela **Opção A (Event sourcing completo)** porque:

1. **Alinha com Changesets:** descritivo de "o que mudou" é naturalmente um evento
2. **Resolver sync:** offline/online é trivial com event replay
3. **Auditoria/compliance:** log imutável é requisito futuro para audit
4. **Debugging:** trail de eventos é essencial para bug reproduction

A complexidade é justificada pelo ganho. Snapshots periódicos (a cada N events) otimizam performance em sessions longas.

## Consequências

### Positivas
- Auditoria completa com `timestamp`, `actor` em cada evento
- Replay/undo/debuggin trivial
- Sync em offline/online funciona com merge de eventos
- Changelog automático derivado de eventos
- Satisfaz requisitos de compliance/audit

### Negativas / Trade-offs
- **Migração v1 → v2:** sessions existentes precisam ser convertidas em evento inicial `created` + follow-up events para mensagens existentes
- **Armazenamento:** log de eventos toma mais espaço que snapshot (mitigado com snapshots periódicos)
- **Complexidade:** applyEvents reducer e event tipos precisam ser mantidos em sync
- **Backward compatibility:** viewer v1 não entende eventos (ok: v2 only release)

### Neutras
- Mudança no contrato de Session (`events` array em lugar de apenas `messages`)
- Performance de reconstituição (mitigado por snapshots + lazy load)

## Validação

Como saberemos que essa decisão foi boa?

- Session com 100+ mensagens reconstrói estado em < 100ms (com snapshot em 50 mensagens)
- Replay de evento específico recupera estado correto
- Sync offline → online funciona sem perda/duplicação (via event dedup)
- Auditoria mostra exatamente quando/quem criou cada mensagem
- Revisão em 2026-05-15 para avaliar performance em sessions reais

## Validação técnica

**Na TASK-01-01:**
- `SessionEventSchema` define todos os tipos de eventos
- `SessionSchema.events: SessionEvent[]`
- Reducer `applyEvents(events): Session` aplica-os em sequência
- Testes verificam roundtrip: events → state e state reconstituído

**Em futuro (TASK-02-04 ou posterior):**
- Snapshots periódicos
- Offline queue de eventos
- Replication / sync logic

## Histórico de alterações

- 2026-04-17: Proposta inicial
- (pendente) Aceita pelo time
