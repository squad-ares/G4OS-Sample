/**
 * Gateway transacional para attachments.
 *
 * Invariantes:
 *   - `attachments.refCount` reflete o número de `attachment_refs` vivos
 *     que apontam para aquele hash.
 *   - Escrita física no filesystem acontece **antes** da transação SQLite;
 *     se o commit falhar, o blob órfão é recolhido pelo próximo `gc()`.
 *   - Deleção física acontece **depois** do commit do SQL (detach);
 *     se o processo morrer entre commit e unlink, o GC também recolhe.
 *
 * Operações SQL rodam em transações síncronas (node-sqlite é sync,
 * ADR-0040a/0042).
 */

import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { attachmentRefs, attachments } from '../schema/attachments.ts';
import type { AttachmentStorage } from './storage.ts';

const DEFAULT_GC_TTL_MS = 30 * 24 * 3600 * 1000;

export interface AttachParams {
  content: Buffer;
  mimeType: string;
  originalName: string;
  sessionId: string;
  messageId?: string;
}

export interface AttachResult {
  refId: string;
  hash: string;
  size: number;
}

export class AttachmentGateway {
  constructor(
    private readonly db: AppDb,
    private readonly storage: AttachmentStorage,
  ) {}

  async attach(params: AttachParams): Promise<AttachResult> {
    const { hash, size } = await this.storage.store(params.content);
    const refId = randomUUID();
    const now = Date.now();

    this.db.transaction((tx) => {
      tx.insert(attachments)
        .values({
          hash,
          size,
          mimeType: params.mimeType,
          refCount: 1,
          createdAt: now,
          lastAccessedAt: now,
        })
        .onConflictDoUpdate({
          target: attachments.hash,
          set: {
            refCount: sql`${attachments.refCount} + 1`,
            lastAccessedAt: now,
          },
        })
        .run();

      tx.insert(attachmentRefs)
        .values({
          id: refId,
          hash,
          sessionId: params.sessionId,
          messageId: params.messageId ?? null,
          originalName: params.originalName,
          createdAt: now,
        })
        .run();
    });

    return { refId, hash, size };
  }

  async detach(refId: string): Promise<void> {
    const orphanHash = this.db.transaction((tx): string | null => {
      const ref = tx
        .select({ hash: attachmentRefs.hash })
        .from(attachmentRefs)
        .where(eq(attachmentRefs.id, refId))
        .get();
      if (!ref) return null;

      tx.delete(attachmentRefs).where(eq(attachmentRefs.id, refId)).run();

      const updated = tx
        .update(attachments)
        .set({
          refCount: sql`${attachments.refCount} - 1`,
          lastAccessedAt: Date.now(),
        })
        .where(eq(attachments.hash, ref.hash))
        .returning({ refCount: attachments.refCount })
        .get();

      if (updated && updated.refCount <= 0) {
        tx.delete(attachments).where(eq(attachments.hash, ref.hash)).run();
        return ref.hash;
      }
      return null;
    });

    if (orphanHash) await this.storage.delete(orphanHash);
  }

  /**
   * Coleta blobs órfãos: `refCount <= 0` e `lastAccessedAt < now - ttlMs`.
   * Retorna o número de arquivos removidos.
   *
   * Cada orphan é finalizado dentro de transação que re-checa `refCount`
   * antes de deletar do DB — evita race com `attach()` concorrente que
   * upserta a mesma `hash` entre o SELECT inicial e o DELETE final.
   * Físico (`storage.delete`) só roda depois do delete SQL bem-sucedido.
   */
  async gc(ttlMs: number = DEFAULT_GC_TTL_MS): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    const candidates = this.db
      .select({ hash: attachments.hash })
      .from(attachments)
      .where(sql`${attachments.refCount} <= 0 AND ${attachments.lastAccessedAt} < ${cutoff}`)
      .all();

    let removed = 0;
    for (const { hash } of candidates) {
      const claimed = this.db.transaction((tx): boolean => {
        // Re-check dentro da tx: caso `attach()` concorrente tenha
        // upsertado refCount=1+ entre o SELECT e este DELETE, abortamos.
        const current = tx
          .select({ refCount: attachments.refCount, lastAccessedAt: attachments.lastAccessedAt })
          .from(attachments)
          .where(eq(attachments.hash, hash))
          .get();
        if (!current) return false;
        if (current.refCount > 0) return false;
        if (current.lastAccessedAt >= cutoff) return false;
        tx.delete(attachments).where(eq(attachments.hash, hash)).run();
        return true;
      });
      if (!claimed) continue;
      await this.storage.delete(hash);
      removed += 1;
    }
    return removed;
  }

  /**
   * Lista hashes referenciados por um workspace (via sessions).
   * Usado pelo backup exporter.
   */
  listReferencedHashesForSessions(sessionIds: readonly string[]): readonly string[] {
    if (sessionIds.length === 0) return [];
    const rows = this.db
      .selectDistinct({ hash: attachmentRefs.hash })
      .from(attachmentRefs)
      .where(sql`${attachmentRefs.sessionId} IN ${sessionIds}`)
      .all();
    return rows.map((r) => r.hash);
  }
}
