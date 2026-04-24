/**
 * Helper de branching. Copia eventos do JSONL da sessão-mãe até
 * `branchedAtSeq` para a nova branch, depois persiste o índice no SQLite.
 *
 * Estratégia copy-prefix (TASK-11-01-04 opção A): eventos são pequenos
 * e SQLite comprime; a complexidade de shared-prefix pointer não
 * compensa para o volume típico de uma sessão.
 *
 * Orquestrado pela camada de serviço (apps/desktop), que já tem acesso
 * ao EventStore (`@g4os/data/events`) + SessionsRepository.
 */

import type { Session, SessionId } from '@g4os/kernel/types';
import type { SessionsRepository } from './repository.ts';

export interface EventStoreReader {
  readReplay(
    sessionId: string,
    options?: { readonly fromSequence?: number },
  ): AsyncIterable<{ readonly sequence: number; readonly payload: unknown }>;
}

export interface EventStoreWriter {
  append(
    sessionId: string,
    event: { readonly type: string; readonly payload?: unknown },
  ): Promise<{ readonly sequence: number }>;
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
    if (event.sequence > input.atSequence) break;
    await deps.writer.append(created.id, {
      type: (event.payload as { type?: string } | null)?.type ?? 'legacy.event',
      payload: event.payload,
    });
    copied++;
  }

  await deps.repository.update(created.id, {
    lastEventSequence: copied,
  });

  return created;
}
