/**
 * Registra shutdown handlers de todos os services do main em ordem.
 * Extraído do composition root para manter `index.ts ≤ 300 LOC`
 * (CR5 follow-up — gate `check:main-size`).
 *
 * Ordem importa: services que dependem de outros (ex: turnDispatcher
 * depende de sessionEventBus) são disposed primeiro. AppLifecycle dispara
 * cada handler em ordem reversa de registro (LIFO) — então registramos
 * do "consumidor" para o "provider" para que recursos básicos vivam até
 * o fim.
 */

import type { AppLifecycle } from '../app-lifecycle.ts';

export interface ShutdownTargets {
  readonly mountRegistry: { dispose(): void };
  // CR6-08: `drain()` é chamado ANTES do dispose para deixar runToolLoop
  // reagir ao AbortSignal antes do agent ser destruído.
  readonly turnDispatcher: { dispose(): void; drain(): Promise<void> };
  readonly sessionEventBus: { dispose(): void };
  readonly cpuPool: { destroy(): void | Promise<void> };
  readonly authRuntime: { dispose(): void };
  readonly sessionsCleanup: { dispose(): void };
  readonly backupScheduler: { dispose(): void };
  readonly titleGenerator: { dispose(): void };
  readonly newsService: { dispose(): void };
  readonly database: { db: { dispose(): void } };
  readonly observability: { dispose(): Promise<void> | void };
}

export function registerShutdownHandlers(lifecycle: AppLifecycle, targets: ShutdownTargets): void {
  lifecycle.onQuit(() => targets.mountRegistry.dispose());
  // CR6-08: `drain()` aborta turnos em voo e aguarda quiescer (deadline curto).
  // Só depois fazemos dispose do agent, pra evitar race entre subscriber e
  // teardown.
  lifecycle.onQuit(() => targets.turnDispatcher.drain());
  lifecycle.onQuit(() => targets.turnDispatcher.dispose());
  lifecycle.onQuit(() => targets.sessionEventBus.dispose());
  lifecycle.onQuit(() => targets.cpuPool.destroy());
  lifecycle.onQuit(() => targets.authRuntime.dispose());
  lifecycle.onQuit(() => targets.sessionsCleanup.dispose());
  lifecycle.onQuit(() => targets.backupScheduler.dispose());
  lifecycle.onQuit(() => targets.titleGenerator.dispose());
  lifecycle.onQuit(() => targets.newsService.dispose());
  lifecycle.onQuit(() => targets.database.db.dispose());
  lifecycle.onQuit(() => void targets.observability.dispose());
  // CR6-06: dispose final remove SIGINT/SIGTERM e listeners de `app`. Em
  // produção single-shot é cosmético (process morre junto), mas em E2E
  // (ADR-0142) reutilizando o processo Node entre `launchApp()` evita
  // listener leak entre execuções.
  lifecycle.onQuit(() => lifecycle.dispose());
}
