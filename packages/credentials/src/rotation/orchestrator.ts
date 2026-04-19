/**
 * Orquestrador de rotação. Varre periodicamente o vault, identifica
 * credenciais próximas de expirar (`expiresAt - now <= bufferMs`) e
 * aciona o primeiro handler compatível.
 *
 * Contrato de ciclo de vida: `start()` começa o intervalo, `dispose()`
 * para o timer e desfaz listeners (pattern `DisposableBase`).
 * Erros de uma credencial não afetam as demais.
 */

import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { CredentialVault } from '../vault.ts';
import type { RotationHandler } from './handler.ts';

const log = createLogger('credential-rotation');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BUFFER_MS = 5 * 60 * 1000;

export interface RotationOrchestratorOptions {
  readonly vault: CredentialVault;
  readonly handlers: readonly RotationHandler[];
  readonly intervalMs?: number;
  readonly bufferMs?: number;
}

export interface RotationTelemetry {
  onRotation(event: { key: string; status: 'ok' | 'error'; error?: unknown }): void;
  onScan(event: { scanned: number; expiring: number }): void;
}

export class RotationOrchestrator extends DisposableBase {
  private readonly vault: CredentialVault;
  private readonly handlers: readonly RotationHandler[];
  private readonly intervalMs: number;
  private readonly bufferMs: number;
  private telemetry: RotationTelemetry | null = null;

  constructor(options: RotationOrchestratorOptions) {
    super();
    this.vault = options.vault;
    this.handlers = options.handlers;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.bufferMs = options.bufferMs ?? DEFAULT_BUFFER_MS;
  }

  setTelemetry(telemetry: RotationTelemetry): void {
    this.telemetry = telemetry;
  }

  /** Rotaciona uma credencial específica se estiver na janela de buffer. */
  async rotateIfExpiring(key: string): Promise<boolean> {
    const list = await this.vault.list();
    if (list.isErr()) return false;

    const meta = list.value.find((m) => m.key === key);
    if (!meta || meta.expiresAt === undefined) return false;
    if (meta.expiresAt - Date.now() > this.bufferMs) return false;

    const handler = this.handlers.find((h) => h.canHandle(key));
    if (!handler) {
      log.warn({ key }, 'no rotation handler registered');
      return false;
    }

    const current = await this.vault.get(key);
    if (current.isErr()) return false;

    try {
      const rotated = await handler.rotate(current.value);
      const write = await this.vault.rotate(key, rotated.newValue);
      if (write.isErr()) throw write.error;
      await this.vault.set(expiryKey(key), String(rotated.expiresAt), {
        expiresAt: rotated.expiresAt,
      });
      this.telemetry?.onRotation({ key, status: 'ok' });
      return true;
    } catch (cause) {
      log.error({ key, err: cause }, 'rotation failed');
      this.telemetry?.onRotation({ key, status: 'error', error: cause });
      return false;
    }
  }

  /**
   * Inicia o loop de varredura. O `setInterval` fica registrado no store
   * da classe; `dispose()` limpa o timer sem vazar referência.
   */
  start(): IDisposable {
    const timer = setInterval(() => {
      this.scanOnce().catch((err: unknown) => {
        log.error({ err }, 'rotation scan failed');
      });
    }, this.intervalMs);

    const disposable = toDisposable(() => clearInterval(timer));
    this._register(disposable);
    return disposable;
  }

  private async scanOnce(): Promise<void> {
    const list = await this.vault.list();
    if (list.isErr()) return;

    const now = Date.now();
    const expiring = list.value.filter(
      (m) => m.expiresAt !== undefined && m.expiresAt - now <= this.bufferMs,
    );
    this.telemetry?.onScan({ scanned: list.value.length, expiring: expiring.length });

    for (const meta of expiring) {
      await this.rotateIfExpiring(meta.key);
    }
  }
}

function expiryKey(key: string): string {
  return `${key}.expires_at`;
}
