import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AgentError } from '@g4os/kernel/errors';
import { createLogger, type Logger } from '@g4os/kernel/logger';
import { decodeFrame, jsonLineEncoder, LineBuffer } from './frame.ts';
import type { CodexRequest, CodexResponseEvent } from './protocol.ts';
import type { Subprocess, SubprocessSpawner } from './subprocess.ts';

export type AppServerListener = (event: CodexResponseEvent) => void;
export type AppServerExitListener = (exit: { code: number | null; signal: string | null }) => void;

export interface AppServerClientOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly spawner: SubprocessSpawner;
  readonly logger?: Logger;
}

export class AppServerClient extends DisposableBase {
  private readonly log: Logger;
  private readonly listeners = new Set<AppServerListener>();
  private readonly exitListeners = new Set<AppServerExitListener>();
  private subprocess: Subprocess | undefined;
  private started = false;
  // CR8-21: rastreia o iterator do stdout para fechar explicitamente em
  // dispose. Sem `return()`, se Codex está travado em write, o async
  // generator do stdout fica pendurado e o subprocess vira zumbi.
  private stdoutIterator: AsyncIterator<string> | undefined;

  constructor(private readonly options: AppServerClientOptions) {
    super();
    this.log = options.logger ?? createLogger('codex-app-server');
  }

  start(): void {
    if (this.started) return;
    const child = this.options.spawner.spawn(
      this.options.command,
      this.options.args ?? ['app-server'],
    );
    this.subprocess = child;
    this.started = true;
    this._register(
      toDisposable(() => {
        // CR8-21: fechar iterator antes de kill — `return()` sinaliza ao
        // source pra liberar recursos (mesmo pattern do Claude
        // stream-runner CR7-25). Try/catch porque iterator pode já estar
        // fechado naturalmente pelo exit do subprocess.
        try {
          void this.stdoutIterator?.return?.();
        } catch {
          // best-effort
        }
        child.kill('SIGTERM');
      }),
    );
    void this.pumpStdout(child);
    void this.watchExit(child);
  }

  on(event: 'message', listener: AppServerListener): () => void;
  on(event: 'exit', listener: AppServerExitListener): () => void;
  on(event: 'message' | 'exit', listener: AppServerListener | AppServerExitListener): () => void {
    if (event === 'message') {
      const typed = listener as AppServerListener;
      this.listeners.add(typed);
      return () => this.listeners.delete(typed);
    }
    const typed = listener as AppServerExitListener;
    this.exitListeners.add(typed);
    return () => this.exitListeners.delete(typed);
  }

  send(request: CodexRequest): Promise<void> {
    if (!this.subprocess) {
      return Promise.reject(AgentError.unavailable('codex', { reason: 'AppServer not started' }));
    }
    const frame = jsonLineEncoder.encode(request);
    return this.subprocess.write(frame);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (reason: pumpStdout combina iterator manual (CR8-21), buffer chunking (LineBuffer), decode com 3-way result (ok/empty/error), trailing flush, catch + finally cleanup — separar perde o controle linear do stream pump.)
  private async pumpStdout(child: Subprocess): Promise<void> {
    const buffer = new LineBuffer();
    // CR8-21: usar iterator manual em vez de `for await ... of`, e armazenar
    // o iterator pra dispose() chamar `return()` explicitamente. `for await`
    // não expõe o iterator subjacente; sem ele, dispose não consegue fechar
    // o stream em flight.
    const iterator = child.stdout[Symbol.asyncIterator]();
    this.stdoutIterator = iterator;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        const lines = buffer.push(next.value);
        for (const line of lines) {
          const result = decodeFrame(line);
          if (result.ok) {
            this.emitMessage(result.event);
          } else if (result.kind !== 'empty') {
            // CR3-18: WARN com `kind` para o consumer (observability)
            // contar parse_error vs schema_error via filtro de log.
            // Linha truncada em 200 chars para evitar log gigante.
            this.log.warn(
              { kind: result.kind, line: result.line.slice(0, 200) },
              'invalid codex frame discarded',
            );
          }
        }
      }
      const trailing = buffer.flush();
      if (trailing) {
        const result = decodeFrame(trailing);
        if (result.ok) this.emitMessage(result.event);
      }
    } catch (err) {
      this.log.warn({ err }, 'codex stdout pump errored');
    } finally {
      this.stdoutIterator = undefined;
    }
  }

  private async watchExit(child: Subprocess): Promise<void> {
    try {
      const exit = await child.exit;
      for (const listener of this.exitListeners) listener(exit);
    } catch (err) {
      this.log.warn({ err }, 'codex subprocess exited with error');
    }
  }

  private emitMessage(event: CodexResponseEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
