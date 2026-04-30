import { type ChildProcess, spawn } from 'node:child_process';
import { AgentError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Subprocess, SubprocessExit, SubprocessSpawner } from './subprocess.ts';

const log = createLogger('codex:node-spawner');

export class NodeSubprocessSpawner implements SubprocessSpawner {
  readonly kind = 'node-child_process' as const;

  spawn(command: string, args: readonly string[]): Subprocess {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    return wrapChildProcess(child, command);
  }
}

export function wrapChildProcess(child: ChildProcess, command: string): Subprocess {
  child.stdout?.setEncoding('utf8');
  const exit = new Promise<SubprocessExit>((resolve, reject) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
    child.on('error', (err) => {
      reject(AgentError.network('codex', { reason: 'subprocess error', command, cause: err }));
    });
  });

  const stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => {
      if (!child.stdout) {
        return {
          next: () => Promise.resolve({ value: undefined as unknown as string, done: true }),
        };
      }
      return child.stdout[Symbol.asyncIterator]() as AsyncIterator<string>;
    },
  };

  return {
    stdout,
    exit,
    write: (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (!child.stdin || child.stdin.destroyed) {
          reject(AgentError.network('codex', { reason: 'stdin closed' }));
          return;
        }
        child.stdin.write(chunk, (err) => {
          if (err) reject(AgentError.network('codex', { reason: 'stdin write', cause: err }));
          else resolve();
        });
      }),
    kill: (signal) => {
      if (child.killed) return;
      // Tree-kill em vez de child.kill direto. Codex spawna
      // sub-processos (bash, python, git) que ficavam vivos quando o
      // codex parent morre — orphans acumulando até reboot. tree-kill é
      // dynamic import + fallback para child.kill se a dep não está
      // instalada (dev sem tree-kill no workspace, smoke test, etc.).
      const pid = child.pid;
      if (typeof pid === 'number') {
        const targetSignal = signal ?? 'SIGTERM';
        void killProcessTree(pid, targetSignal).catch((err) => {
          log.warn(
            { err: String(err), pid, signal: targetSignal },
            'tree-kill failed; falling back to direct child.kill',
          );
          child.kill(targetSignal);
        });
        return;
      }
      child.kill(signal ?? 'SIGTERM');
    },
  };
}

async function killProcessTree(pid: number, signal: string): Promise<void> {
  const specifier = 'tree-kill';
  type TreeKillFn = (pid: number, signal: string, callback?: (err?: Error) => void) => void;
  let mod: { default?: TreeKillFn };
  try {
    mod = (await import(/* @vite-ignore */ specifier)) as { default?: TreeKillFn };
  } catch {
    // tree-kill não instalado — sinaliza que caller deve fallback.
    throw new Error('tree-kill module not available');
  }
  const fn = mod.default;
  if (typeof fn !== 'function') throw new Error('tree-kill default export missing');
  await new Promise<void>((resolve, reject) => {
    fn(pid, signal, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
