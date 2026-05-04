/**
 * Helper de branching. Copia eventos do JSONL da sessão-mãe até
 * `branchedAtSeq` para a nova branch, depois persiste o índice no SQLite.
 *
 * Estratégia copy-prefix (opção A): eventos são pequenos
 * e SQLite comprime; a complexidade de shared-prefix pointer não
 * compensa para o volume típico de uma sessão.
 *
 * Orquestrado pela camada de serviço (apps/desktop), que já tem acesso
 * ao EventStore (`@g4os/data/events`) + SessionsRepository.
 *
 * **CALLER MUST: chamar `rebuildProjection(db, eventStore, result.id)`
 * imediatamente após `branchSession` retornar.** Esta função apenas
 * popula o JSONL da branch e o registro `sessions` em SQLite — não
 * popula `messages_index` (consumer separado pra search/list). Sem o
 * rebuild, busca/listagem da branch fica vazia até o próximo restart
 * full do app. Caller canônico em `apps/desktop/src/main/services/sessions-service.ts`
 * já segue esse contrato.
 *
 * Writer é o `SessionEventStore` real — antes era um placeholder que
 * retornava `{ sequence: 0 }` e não validava payload. Cada evento
 * copiado é re-emitido com:
 *   - novo `sessionId` (a branch)
 *   - novo `sequenceNumber` (1..copied — preserva ordem mas reseta para
 *     a branch, já que a sessão-mãe pode continuar avançando)
 *   - novo `eventId` (UUID — permite distinguir o evento da branch do
 *     mesmo evento na mãe em projeções globais)
 *   - resto do payload preservado (timestamp original, kind, etc.)
 */

import { randomUUID } from 'node:crypto';
import { type SessionEvent, SessionEventSchema } from '@g4os/kernel/schemas';
import type { Session, SessionId } from '@g4os/kernel/types';
import type { SessionsRepository } from './repository.ts';

export interface EventStoreReader {
  readReplay(
    sessionId: string,
    options?: { readonly fromSequence?: number },
  ): AsyncIterable<{ readonly sequence: number; readonly payload: unknown }>;
}

export interface EventStoreWriter {
  /**
   * Escreve evento já formatado (com sessionId/sequenceNumber/eventId
   * corretos) no JSONL. Implementação canônica é
   * `SessionEventStore.append` — wrapper validates via Zod schema.
   */
  append(sessionId: string, event: SessionEvent): Promise<void>;
}

export interface BranchSessionInput {
  readonly sourceId: SessionId;
  readonly atSequence: number;
  readonly name?: string;
  readonly newId?: SessionId;
}

export async function branchSession(
  input: BranchSessionInput,
  deps: {
    readonly repository: SessionsRepository;
    readonly reader: EventStoreReader;
    readonly writer: EventStoreWriter;
  },
): Promise<Session> {
  const source = await deps.repository.get(input.sourceId);
  if (!source) throw new Error(`source session ${input.sourceId} not found`);

  const created = await deps.repository.create({
    ...(input.newId ? { id: input.newId } : {}),
    workspaceId: source.workspaceId,
    name: input.name ?? `${source.name} (branch)`,
    parentId: input.sourceId,
    branchedAtSeq: input.atSequence,
    ...(source.projectId ? { projectId: source.projectId } : {}),
  });

  let copied = 0;
  for await (const event of deps.reader.readReplay(input.sourceId)) {
    // F-CR36-11: `continue` em vez de `break` — se o reader retornar eventos
    // fora de ordem (paralelismo, source heterogêneo), `break` pararia cedo
    // e deixaria a branch incompleta sem sinal. `continue` filtra explicitamente,
    // independente da garantia de ordering do reader.
    if (event.sequence > input.atSequence) continue;
    const reEmitted = reEmitEventForBranch(event.payload, created.id, copied + 1);
    if (!reEmitted) continue;
    await deps.writer.append(created.id, reEmitted);
    copied++;
  }

  await deps.repository.update(created.id, {
    lastEventSequence: copied,
  });

  return created;
}

/**
 * Reescreve um evento da sessão-mãe para a branch: substitui
 * `sessionId`/`sequenceNumber`/`eventId`, preserva o resto. Valida via
 * Zod — payloads corrompidos da mãe são skipped (warn no chamador).
 */
function reEmitEventForBranch(
  rawPayload: unknown,
  newSessionId: SessionId,
  newSequence: number,
): SessionEvent | null {
  if (rawPayload === null || typeof rawPayload !== 'object') return null;
  const candidate = {
    ...(rawPayload as Record<string, unknown>),
    sessionId: newSessionId,
    sequenceNumber: newSequence,
    eventId: randomUUID(),
  };
  const parsed = SessionEventSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return parsed.data;
}
