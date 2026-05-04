/**
 * MessagesService — append/list/search de mensagens de uma sessão.
 *
 * Fonte de verdade: event log JSONL por sessão (`message.added` events).
 * Index SQLite (`messages_index`) é projeção para listagem/search rápida,
 * mas content blocks ficam apenas no JSONL.
 *
 * `append` publica `message.added` no event log, aplica reducer na projection
 * e retorna a mensagem persistida. Não dispara turn de agente — isso é
 * responsabilidade de `SessionManager.sendMessage` (ainda stub V2).
 */

import { randomUUID } from 'node:crypto';
import type { AppDb } from '@g4os/data';
import { applyEvent, SessionEventStore } from '@g4os/data/events';
import { messagesIndex } from '@g4os/data/schema';
import { SessionsRepository } from '@g4os/data/sessions';
import type { MessagesService as MessagesServiceContract } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type {
  ContentBlock,
  Message,
  MessageAppendResult,
  MessageId,
  SearchMatch,
  SessionEvent,
  SessionId,
} from '@g4os/kernel/types';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

const log = createLogger('messages-service');

export interface MessagesServiceDeps {
  readonly drizzle: AppDb;
}

export class SqliteMessagesService implements MessagesServiceContract {
  readonly #deps: MessagesServiceDeps;
  readonly #sessions: SessionsRepository;

  constructor(deps: MessagesServiceDeps) {
    this.#deps = deps;
    this.#sessions = new SessionsRepository(deps.drizzle);
  }

  async list(sessionId: SessionId): Promise<Result<readonly Message[], AppError>> {
    try {
      const session = await this.#sessions.get(sessionId);
      if (!session) return err(notFoundSession(sessionId));
      const store = new SessionEventStore(session.workspaceId);
      const messages: Message[] = [];
      for await (const event of store.read(sessionId)) {
        if (event.type === 'message.added') messages.push(event.message);
      }
      messages.sort((a, b) => a.createdAt - b.createdAt);
      return ok(messages);
    } catch (error) {
      log.error({ err: error, sessionId }, 'messages.list failed');
      return err(wrap('messages.list', error));
    }
  }

  async get(id: MessageId): Promise<Result<Message, AppError>> {
    try {
      const rows = await this.#deps.drizzle
        .select({ sessionId: messagesIndex.sessionId })
        .from(messagesIndex)
        .where(eq(messagesIndex.id, id))
        .limit(1);
      const sessionId = rows[0]?.sessionId;
      if (!sessionId) return err(notFoundMessage(id));

      const session = await this.#sessions.get(sessionId);
      if (!session) return err(notFoundSession(sessionId));

      const store = new SessionEventStore(session.workspaceId);
      for await (const event of store.read(sessionId)) {
        if (event.type === 'message.added' && event.message.id === id) {
          return ok(event.message);
        }
      }
      return err(notFoundMessage(id));
    } catch (error) {
      log.error({ err: error, id }, 'messages.get failed');
      return err(wrap('messages.get', error));
    }
  }

  async append(
    input: Pick<Message, 'sessionId' | 'role' | 'content'> & {
      readonly metadata?: Pick<
        NonNullable<Message['metadata']>,
        'systemKind' | 'errorCode' | 'modelId' | 'usage' | 'thinkingLevel' | 'durationMs'
      >;
    },
  ): Promise<Result<MessageAppendResult, AppError>> {
    try {
      const session = await this.#sessions.get(input.sessionId);
      if (!session) return err(notFoundSession(input.sessionId));

      const now = Date.now();
      const message: Message = {
        id: randomUUID(),
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        attachments: [],
        createdAt: now,
        updatedAt: now,
        // CR-25 F-CR25-1: pass-through completo do metadata server-trusted.
        // CR-24 F-CR24-1 cobria só `systemKind`/`errorCode`; rotas internas
        // do session-runtime agora propagam `modelId`/`usage`/`thinkingLevel`/
        // `durationMs` para que `messages_index.tokenCount` reflita o turno.
        // F-CR51-13: `usage-reconcile-worker` é skeleton (TASK-18-07) — não
        // spawned ainda. Billing reconciliation fica como FOLLOWUP-OUTLIER-18-07.
        metadata: input.metadata ?? {},
      };

      const sequenceNumber = session.lastEventSequence + 1;
      const event: SessionEvent = {
        eventId: randomUUID(),
        sessionId: input.sessionId,
        sequenceNumber,
        timestamp: now,
        type: 'message.added',
        message,
      };

      const store = new SessionEventStore(session.workspaceId);
      await store.append(input.sessionId, event);
      applyEvent(this.#deps.drizzle, event);

      return ok({ message, sequenceNumber });
    } catch (error) {
      log.error({ err: error, sessionId: input.sessionId }, 'messages.append failed');
      return err(wrap('messages.append', error));
    }
  }

  async search(
    sessionId: SessionId,
    query: string,
  ): Promise<Result<readonly SearchMatch[], AppError>> {
    try {
      const session = await this.#sessions.get(sessionId);
      if (!session) return err(notFoundSession(sessionId));
      const needle = query.trim().toLowerCase();
      if (needle.length === 0) return ok([]);

      const store = new SessionEventStore(session.workspaceId);
      const matches: SearchMatch[] = [];
      for await (const event of store.read(sessionId)) {
        if (event.type !== 'message.added') continue;
        const haystack = contentToPlainText(event.message.content).toLowerCase();
        const idx = haystack.indexOf(needle);
        if (idx < 0) continue;
        matches.push({
          messageId: event.message.id,
          sequence: event.sequenceNumber,
          snippet: extractSnippet(haystack, idx, needle.length),
        });
      }
      return ok(matches);
    } catch (error) {
      log.error({ err: error, sessionId }, 'messages.search failed');
      return err(wrap('messages.search', error));
    }
  }
}

function contentToPlainText(content: readonly ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text);
    else if (block.type === 'thinking') parts.push(block.text);
  }
  return parts.join('\n');
}

function extractSnippet(haystack: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 40);
  const end = Math.min(haystack.length, idx + len + 40);
  return haystack.slice(start, end);
}

function notFoundSession(sessionId: string): AppError {
  return new AppError({
    code: ErrorCode.SESSION_NOT_FOUND,
    message: `Sessão ${sessionId} não encontrada`,
    context: { sessionId },
  });
}

function notFoundMessage(id: string): AppError {
  return new AppError({
    code: ErrorCode.SESSION_NOT_FOUND,
    message: `Mensagem ${id} não encontrada`,
    context: { id },
  });
}

function wrap(scope: string, cause: unknown): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `${scope}: falha inesperada`,
    ...(cause instanceof Error ? { cause } : {}),
    context: { scope },
  });
}
