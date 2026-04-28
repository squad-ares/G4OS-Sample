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
  // CR9: guard contra scan paralelo. Sem isso, se OAuth refresh leva mais
  // que `intervalMs` (timeout, network), o próximo tick lança outro scan
  // em paralelo — duas iterações concorrentes podem rotar a mesma key
  // duas vezes (gera token duplo, pode invalidar o anterior remotamente).
  private scanInflight: Promise<void> | null = null;

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
      // Grava novo valor + novo expiresAt na meta da MESMA key. Antes
      // tinha um `set(<key>.expires_at, ...)` paralelo que deixava a
      // meta da key principal com expiry vencido → próximo scan
      // disparava handler em loop infinito.
      const write = await this.vault.rotate(key, rotated.newValue, {
        expiresAt: rotated.expiresAt,
      });
      if (write.isErr()) {
        // CR5-08: ADR-0011 Result pattern — rotação falhada é caminho
        // esperado, retorna false em vez de lançar. Telemetria preserva
        // contexto via log estruturado.
        log.warn({ key, err: write.error }, 'rotation write failed');
        this.telemetry?.onRotation({ key, status: 'error', error: write.error });
        return false;
      }
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
      // CR9: skip se scan anterior ainda em flight. Caller que chama
      // rotateIfExpiring direto não passa por aqui — guard cobre só o
      // loop automático.
      if (this.scanInflight) return;
      this.scanInflight = this.scanOnce()
        .catch((err: unknown) => {
          log.error({ err }, 'rotation scan failed');
        })
        .finally(() => {
          this.scanInflight = null;
        });
    }, this.intervalMs);
    // CR4-10: timer não pode segurar o process vivo após shutdown handler
    // ser instalado mais tarde no boot. ADR-0032 exige graceful exit em 5s.
    timer.unref?.();

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
