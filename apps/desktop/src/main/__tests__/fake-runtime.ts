/**
 * Fake `ElectronRuntime` para testes de integração do worker + supervisor.
 *
 * Substitui `utilityProcess.fork` por um stub controlável que expõe
 * `simulateMessage(...)` e `simulateExit(...)` para drivers de teste
 * simularem o comportamento do worker sem spawn real.
 */

import type {
  ElectronApp,
  ElectronRuntime,
  NodeReadable,
  UtilityProcessFactory,
  UtilityProcessInstance,
} from '../electron-runtime.ts';

export interface FakeUtilityProcess extends UtilityProcessInstance {
  readonly modulePath: string;
  readonly args: readonly string[];
  readonly posted: unknown[];
  readonly killCalls: number;
  simulateMessage(msg: unknown): void;
  simulateExit(code: number | null): void;
  simulateStdout(chunk: string): void;
  simulateStderr(chunk: string): void;
}

export interface FakeRuntimeOptions {
  /**
   * Quando `true` (default), `kill()` e `postMessage({ type: 'shutdown' })`
   * emitem `exit` imediatamente — comportamento que simula o worker real
   * cooperativo. Passe `false` para simular worker "stuck" (não cooperativo)
   * que força o supervisor a chamar `kill()` após o deadline.
   */
  readonly autoExitOnShutdown?: boolean;
}

export function createFakeRuntime(options: FakeRuntimeOptions = {}): {
  runtime: ElectronRuntime;
  processes: FakeUtilityProcess[];
} {
  const processes: FakeUtilityProcess[] = [];
  const autoExit = options.autoExitOnShutdown ?? true;

  const utilityProcess: UtilityProcessFactory = {
    fork(modulePath, args) {
      const messageHandlers: Array<(msg: unknown) => void> = [];
      const exitHandlers: Array<(code: number | null) => void> = [];
      const stdoutHandlers: Array<(chunk: unknown) => void> = [];
      const stderrHandlers: Array<(chunk: unknown) => void> = [];
      const posted: unknown[] = [];

      const stdout: NodeReadable = {
        on(event, handler) {
          if (event === 'data') stdoutHandlers.push(handler);
        },
      };
      const stderr: NodeReadable = {
        on(event, handler) {
          if (event === 'data') stderrHandlers.push(handler);
        },
      };

      let killCalls = 0;
      const instance: FakeUtilityProcess = {
        pid: 1000 + processes.length,
        stdout,
        stderr,
        modulePath,
        args: args ? [...args] : [],
        posted,
        get killCalls() {
          return killCalls;
        },
        on(event, handler) {
          if (event === 'message') messageHandlers.push(handler as (msg: unknown) => void);
          if (event === 'exit') exitHandlers.push(handler as (code: number | null) => void);
        },
        once(event, handler) {
          if (event === 'exit') {
            const wrap = (code: number | null): void => {
              handler(code);
              const idx = exitHandlers.indexOf(wrap);
              if (idx >= 0) exitHandlers.splice(idx, 1);
            };
            exitHandlers.push(wrap);
          }
        },
        postMessage(message: unknown): void {
          posted.push(message);
          // Em worker real, `{ type: 'shutdown' }` causa process.exit(0).
          // Simulamos aqui em microtask para manter ordem de eventos.
          if (
            autoExit &&
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: string }).type === 'shutdown'
          ) {
            queueMicrotask(() => {
              for (const h of [...exitHandlers]) h(0);
            });
          }
        },
        kill(): boolean {
          killCalls++;
          // kill() também emite exit imediato (SIGKILL). Mesmo com autoExit=false,
          // kill() sempre termina o processo — é o force-kill path.
          queueMicrotask(() => {
            for (const h of [...exitHandlers]) h(137);
          });
          return true;
        },
        simulateMessage(msg: unknown): void {
          for (const h of [...messageHandlers]) h(msg);
        },
        simulateExit(code: number | null): void {
          for (const h of [...exitHandlers]) h(code);
        },
        simulateStdout(chunk: string): void {
          for (const h of [...stdoutHandlers]) h(chunk);
        },
        simulateStderr(chunk: string): void {
          for (const h of [...stderrHandlers]) h(chunk);
        },
      };

      processes.push(instance);
      return instance;
    },
  };

  const app: ElectronApp = {
    isPackaged: false,
    getVersion: () => '0.0.0-test',
    whenReady: () => Promise.resolve(),
    quit: () => undefined,
    exit: () => undefined,
    relaunch: () => undefined,
    on: () => undefined,
  };

  const runtime: ElectronRuntime = {
    app,
    BrowserWindow: class {} as unknown as ElectronRuntime['BrowserWindow'],
    utilityProcess,
  };

  return { runtime, processes };
}
