/**
 * Reducer: aplica um `SessionEvent` nas projections SQLite (sessions,
 * messages_index, event_checkpoints).
 *
 * Atomicidade:
 *   - `applyEvent` aceita `AppDb` ou um objeto de transação Drizzle.
 *     Quando chamado com `AppDb`, abre uma transação própria (modo isolado,
 *     para eventos individuais como em `catchUp`). Quando chamado com um
 *     objeto de transação (ex.: em `rebuildProjection`), opera dentro da
 *     transação do caller — N eventos = 1 fsync WAL em vez de N.
 *   - Falha parcial lança — caller decide se rebuilda a projection
 *     inteira (ver `replay.ts`).
 *
 * Checkpoints:
 *   - Todos eventos atualizam `event_checkpoints` para o consumer
 *     `messages-index`. Se o processo crashar após escrever no JSONL
 *     mas antes do commit, o próximo boot detecta `lastSequence` < última
 *     linha do log e reaplica o delta.
 *
 * Extensibilidade: novos tipos de evento precisam de:
 *   1. Novo branch no switch (com field select exaustivo)
 *   2. Se alterar projection, nova migration
 *   3. Teste de replay idempotente
 */

import type { ContentBlock, SessionEvent } from '@g4os/kernel/schemas';
import { eq, sql } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { eventCheckpoints } from '../schema/event-checkpoints.ts';
import { messagesIndex } from '../schema/messages-index.ts';
import { sessions } from '../schema/sessions.ts';

const CONSUMER_NAME = 'messages-index';
const CONTENT_PREVIEW_MAX = 200;

/**
 * F-CR36-2: `AppDb | AppTx` — permite chamar `applyEvent` tanto em modo
 * isolado (AppDb, abre tx própria) quanto dentro de uma tx existente (AppTx).
 * O callback de `db.transaction` recebe um objeto com as mesmas operações DML,
 * sem o método `transaction` do nível raiz.
 */
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

export function applyEvent(db: AppDb | AppTx, event: SessionEvent): void {
  // Quando chamado com AppDb (tem `transaction`), envolve em tx própria.
  // Quando chamado com AppTx (dentro de outra tx), opera direto — o caller
  // já abriu a transação envolvente (batch em rebuildProjection).
  if ('transaction' in db) {
    db.transaction((tx) => applyEventInTx(tx, event));
    return;
  }
  applyEventInTx(db, event);
}

function applyEventInTx(tx: AppTx, event: SessionEvent): void {
  switch (event.type) {
    case 'session.created': {
      // `onConflictDoUpdate` torna a inserção idempotente: se a row já
      // existe (rebuildProjection que preservou a row via update em vez
      // de delete), sobrescreve apenas os campos que o reducer reconstrói
      // — preserva attachment_refs/session_labels via CASCADE e flags
      // persistidos fora do event log (pinnedAt, starredAt, etc.).
      tx.insert(sessions)
        .values({
          id: event.sessionId,
          workspaceId: event.workspaceId,
          name: event.name,
          status: 'active',
          lastEventSequence: event.sequenceNumber,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            workspaceId: event.workspaceId,
            name: event.name,
            status: 'active',
            lastEventSequence: event.sequenceNumber,
            updatedAt: event.timestamp,
          },
        })
        .run();
      break;
    }

    case 'message.added': {
      tx.insert(messagesIndex)
        .values({
          id: event.message.id,
          sessionId: event.sessionId,
          sequence: event.sequenceNumber,
          role: event.message.role,
          contentPreview: contentPreview(event.message.content),
          tokenCount: totalTokens(event.message.metadata.usage),
          createdAt: event.message.createdAt,
        })
        .run();

      tx.update(sessions)
        .set({
          messageCount: sql`${sessions.messageCount} + 1`,
          lastMessageAt: event.message.createdAt,
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'message.updated': {
      tx.update(sessions)
        .set({
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'session.renamed': {
      tx.update(sessions)
        .set({
          name: event.newName,
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'session.labeled': {
      tx.update(sessions)
        .set({
          metadata: sql`json_set(${sessions.metadata}, '$.labels', json(${JSON.stringify(event.labels)}))`,
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'session.flagged': {
      tx.update(sessions)
        .set({
          metadata: sql`json_set(${sessions.metadata}, '$.flaggedReason', ${event.reason ?? null})`,
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'session.archived': {
      tx.update(sessions)
        .set({
          status: 'archived',
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'session.deleted': {
      tx.update(sessions)
        .set({
          status: 'deleted',
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }

    case 'tool.invoked':
    case 'tool.completed': {
      // Tool events são gravados no JSONL mas não alteram projection
      // de sessão/mensagem diretamente — são consumidos por telemetria
      // (futuro). Ainda assim avançamos o cursor para manter replay
      // determinístico.
      tx.update(sessions)
        .set({
          lastEventSequence: event.sequenceNumber,
          updatedAt: event.timestamp,
        })
        .where(eq(sessions.id, event.sessionId))
        .run();
      break;
    }
  }

  tx.insert(eventCheckpoints)
    .values({
      consumerName: CONSUMER_NAME,
      sessionId: event.sessionId,
      lastSequence: event.sequenceNumber,
      checkpointedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [eventCheckpoints.consumerName, eventCheckpoints.sessionId],
      set: {
        lastSequence: event.sequenceNumber,
        checkpointedAt: Date.now(),
      },
    })
    .run();
}

function contentPreview(blocks: readonly ContentBlock[]): string {
  const text = blocks
    .map((b) => (b.type === 'text' ? b.text : b.type === 'thinking' ? b.text : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  return text.length > CONTENT_PREVIEW_MAX ? `${text.slice(0, CONTENT_PREVIEW_MAX - 1)}…` : text;
}

function totalTokens(
  usage: { inputTokens: number; outputTokens: number } | undefined,
): number | null {
  if (!usage) return null;
  return usage.inputTokens + usage.outputTokens;
}
