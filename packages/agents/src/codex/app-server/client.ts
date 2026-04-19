import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AgentError } from '@g4os/kernel/errors';
import { createLogger, type Logger } from '@g4os/kernel/logger';
import { jsonLineDecoder, jsonLineEncoder, LineBuffer } from './frame.ts';
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
    this._register(toDisposable(() => child.kill('SIGTERM')));
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

  private async pumpStdout(child: Subprocess): Promise<void> {
    const buffer = new LineBuffer();
    try {
      for await (const chunk of child.stdout) {
        const lines = buffer.push(chunk);
        for (const line of lines) {
          const event = jsonLineDecoder.decode(line);
          if (event) this.emitMessage(event);
          else this.log.debug({ line }, 'discarded unparseable codex frame');
        }
      }
      const trailing = buffer.flush();
      if (trailing) {
        const event = jsonLineDecoder.decode(trailing);
        if (event) this.emitMessage(event);
      }
    } catch (err) {
      this.log.warn({ err }, 'codex stdout pump errored');
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
