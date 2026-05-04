/**
 * Scheduler de garbage collection pra attachments content-addressed.
 *
 * `AttachmentGateway.gc()` remove blobs com refCount ≤ 0 (nenhuma
 * sessão referencia). Sem scheduler, blobs órfãos acumulam
 * indefinidamente em `attachments/<2-char-prefix>/<hash>`. Em workspaces
 * de longa duração, vira leak de disco monotônico.
 *
 * Default cycle: 24h (mesmo período do BackupScheduler). Warmup 5min
 * pós-boot pra não competir com cold-start. Timer `.unref()` pra não
 * segurar processo se nada mais estiver pendente.
 */

import type { AttachmentGateway } from '@g4os/data/attachments';
import { type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('attachments-gc');
const WARMUP_MS = 5 * 60 * 1000;
const GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startAttachmentsGcScheduler(gateway: AttachmentGateway): IDisposable {
  let warmupHandle: NodeJS.Timeout | null = null;
  let intervalHandle: NodeJS.Timeout | null = null;

  const tick = (): void => {
    void gateway.gc().then(
      (result) => {
        log.info({ result }, 'attachments gc cycle complete');
      },
      (err: unknown) => {
        log.warn({ err }, 'attachments gc cycle failed');
      },
    );
  };

  warmupHandle = setTimeout(() => {
    warmupHandle = null;
    tick();
    intervalHandle = setInterval(tick, GC_INTERVAL_MS);
    intervalHandle.unref?.();
  }, WARMUP_MS);
  warmupHandle.unref?.();

  return toDisposable(() => {
    if (warmupHandle) clearTimeout(warmupHandle);
    if (intervalHandle) clearInterval(intervalHandle);
  });
}
