import { isWindows } from '@g4os/platform';

/**
 * Resolve o shell nativo da plataforma para `run_bash`:
 *   - `win32` → `cmd.exe /c <command>`
 *   - outros  → `/bin/sh -c <command>`
 *
 * `process.env.ComSpec` (Windows) ou `SHELL` (Unix) poderiam customizar, mas
 * o tool handler é sandbox mínimo — usamos o binário de sistema esperado
 * sem permitir override de shell pela session. Se um dia precisar, um novo
 * input schema controlará isso explicitamente.
 *
 * Detecção de plataforma vai por `@g4os/platform` (ADR-0013) — proibido
 * `process.platform` direto fora desse pacote.
 */

export interface ShellInvocation {
  readonly executable: string;
  readonly args: readonly string[];
}

export function resolveShell(command: string): ShellInvocation {
  if (isWindows()) {
    return { executable: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { executable: '/bin/sh', args: ['-c', command] };
}
