/**
 * Registra shutdown handlers de todos os services do main em ordem.
 * Extraído do composition root para manter `index.ts ≤ 500 LOC`
 * (gate `check:main-size`).
 *
 * Ordem importa: services que dependem de outros (ex: turnDispatcher
 * depende de sessionEventBus) são disposed primeiro. CR-18 F-DT-J:
 * `AppLifecycle.shutdown()` usa `Promise.allSettled` (paralelo, NÃO LIFO)
 * — o comentário antigo afirmava LIFO erroneamente. Cada handler tem
 * deadline próprio, então a ordem de registro influencia tie-breakers
 * mas NÃO sequencia execução. Para serializar (raríssimo em prática),
 * usar `for…await` interno no próprio handler.
 */

import type { AppLifecycle } from '../app-lifecycle.ts';

export interface ShutdownTargets {
  readonly mountRegistry: { dispose(): void };
  // `drain()` é chamado ANTES do dispose para deixar runToolLoop
  // reagir ao AbortSignal antes do agent ser destruído.
  readonly turnDispatcher: { dispose(): void; drain(): Promise<void> };
  readonly sessionEventBus: { dispose(): void };
  readonly cpuPool: { destroy(): void | Promise<void> };
  readonly authRuntime: { dispose(): void };
  readonly sessionsCleanup: { dispose(): void };
  readonly backupScheduler: { dispose(): void; drain(timeoutMs?: number): Promise<boolean> };
  readonly titleGenerator: { dispose(): void };
  readonly newsService: { dispose(): void };
  readonly database: { db: { dispose(): void } };
  readonly observability: { dispose(): Promise<void> | void };
  readonly updates: { dispose(): void };
}

export function registerShutdownHandlers(lifecycle: AppLifecycle, targets: ShutdownTargets): void {
  lifecycle.onQuit(() => targets.mountRegistry.dispose());
  // `drain()` aborta turnos em voo e aguarda quiescer (deadline curto).
  // Só depois fazemos dispose do agent, pra evitar race entre subscriber e
  // teardown.
  lifecycle.onQuit(() => targets.turnDispatcher.drain());
  lifecycle.onQuit(() => targets.turnDispatcher.dispose());
  lifecycle.onQuit(() => targets.sessionEventBus.dispose());
  lifecycle.onQuit(() => targets.cpuPool.destroy());
  lifecycle.onQuit(() => targets.authRuntime.dispose());
  lifecycle.onQuit(() => targets.sessionsCleanup.dispose());
  // Drain antes do dispose: aguarda runOnce em-voo terminar (timeout 2s)
  // pra evitar ZIP parcial corrompido se quit dispara mid-write.
  lifecycle.onQuit(async () => {
    await targets.backupScheduler.drain();
    targets.backupScheduler.dispose();
  });
  lifecycle.onQuit(() => targets.titleGenerator.dispose());
  lifecycle.onQuit(() => targets.newsService.dispose());
  lifecycle.onQuit(() => targets.database.db.dispose());
  lifecycle.onQuit(() => void targets.observability.dispose());
  // UpdateService remove listeners do autoUpdater. Em E2E/dev
  // o runtime é noop, dispose é no-op também.
  lifecycle.onQuit(() => targets.updates.dispose());
  // Dispose final remove SIGINT/SIGTERM e listeners de `app`. Em
  // produção single-shot é cosmético (process morre junto), mas em E2E
  // (ADR-0142) reutilizando o processo Node entre `launchApp()` evita
  // listener leak entre execuções.
  lifecycle.onQuit(() => lifecycle.dispose());
}
