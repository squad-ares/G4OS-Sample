import { spawn } from 'node:child_process';
import { err, ok, type Result } from 'neverthrow';
import { resolveShell } from '../shared/shell-launcher.ts';
import type { ToolFailure, ToolHandler, ToolHandlerResult } from '../types.ts';

interface RunBashInput {
  readonly command: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export const runBashHandler: ToolHandler = {
  definition: {
    name: 'run_bash',
    description:
      'Execute a short shell command inside the session working directory. Always prompts for permission.',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', minLength: 1 },
        timeoutMs: { type: 'integer', minimum: 500, maximum: MAX_TIMEOUT_MS },
      },
    },
  },

  async execute(input, ctx): Promise<ToolHandlerResult> {
    const parsed = parseInput(input);
    if (parsed.isErr()) return err(parsed.error);

    const timeoutMs = parsed.value.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const result = await runOnce(
        parsed.value.command,
        ctx.workingDirectory,
        timeoutMs,
        ctx.signal,
      );
      return ok({
        output: formatOutput(result),
        metadata: {
          exitCode: result.exitCode,
          signal: result.signal,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
          truncatedStdout: result.truncatedStdout,
          truncatedStderr: result.truncatedStderr,
        },
      });
    } catch (error) {
      return err({
        code: 'tool.run_bash.failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

interface BashResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly truncatedStdout: boolean;
  readonly truncatedStderr: boolean;
}

function runOnce(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<BashResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const start = Date.now();
    const { executable, args } = resolveShell(command);
    const child = spawn(executable, [...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    // CR-37 F-CR37-1: contadores de byte explícitos. `stdout.length` é JS
    // string length (UTF-16 code units) e NÃO é equivalente a byte count em
    // UTF-8 — para CJK Han (3 bytes/char), emoji (4 bytes via surrogate
    // pair) e acentos latim-1 (2 bytes/char), comparar `stdout.length +
    // chunk.byteLength` contra `MAX_OUTPUT_BYTES` (em bytes) bypassa o cap
    // em 2-4×, e o `subarray(0, MAX_OUTPUT_BYTES - stdout.length)` corta o
    // chunk numa posição de byte arbitrária que pode cair mid-multibyte e
    // produzir `�` na conversão `toString('utf8')`. Mesmo padrão do
    // `Buffer.byteLength` em `file-ops.ts:103` (CR-35 F-CR35-1) e
    // `write-file.ts:43`. Acumulamos byte count separado.
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncatedStdout = false;
    let truncatedStderr = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    // CR-35 F-CR35-2: unref pra não travar graceful shutdown caso o SIGTERM
    // não consiga matar o subprocess imediatamente (zombie, syscall bloqueada,
    // signal mask). Sem unref, `app.exit(0)` da AppLifecycle ainda força quit
    // em 5s, mas o draining percebido pelo usuário pode chegar a `timeoutMs`
    // (até 2 min worst case). Mesmo padrão dos siblings em `tool-execution.ts:220`,
    // `source-probe.ts:82` (CR-34 F-CR34-3), `oauth/callback-handler.ts:68`,
    // `oauth/loopback.ts:117`, `permission-broker.ts:188`.
    timer.unref?.();

    const onAbort = (): void => {
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBytes + chunk.byteLength > MAX_OUTPUT_BYTES) {
        const room = Math.max(0, MAX_OUTPUT_BYTES - stdoutBytes);
        if (room > 0) {
          const slice = chunk.subarray(0, room);
          stdout += slice.toString('utf8');
          stdoutBytes += slice.byteLength;
        }
        truncatedStdout = true;
      } else {
        stdout += chunk.toString('utf8');
        stdoutBytes += chunk.byteLength;
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBytes + chunk.byteLength > MAX_OUTPUT_BYTES) {
        const room = Math.max(0, MAX_OUTPUT_BYTES - stderrBytes);
        if (room > 0) {
          const slice = chunk.subarray(0, room);
          stderr += slice.toString('utf8');
          stderrBytes += slice.byteLength;
        }
        truncatedStderr = true;
      } else {
        stderr += chunk.toString('utf8');
        stderrBytes += chunk.byteLength;
      }
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      rejectPromise(error);
    });

    child.on('close', (exitCode, childSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolvePromise({
        stdout,
        stderr,
        exitCode,
        signal: childSignal,
        durationMs: Date.now() - start,
        timedOut,
        truncatedStdout,
        truncatedStderr,
      });
    });
  });
}

function formatOutput(result: BashResult): string {
  const parts: string[] = [];
  if (result.stdout.length > 0) parts.push(`stdout:\n${result.stdout}`);
  if (result.stderr.length > 0) parts.push(`stderr:\n${result.stderr}`);
  if (result.exitCode !== null) parts.push(`exit: ${result.exitCode}`);
  if (result.signal !== null) parts.push(`signal: ${result.signal}`);
  if (result.timedOut) parts.push('timed out');
  return parts.join('\n');
}

function parseInput(input: Readonly<Record<string, unknown>>): Result<RunBashInput, ToolFailure> {
  const rawCommand = input['command'];
  if (typeof rawCommand !== 'string' || rawCommand.trim().length === 0) {
    return err({
      code: 'tool.run_bash.invalid_input',
      message: 'command must be a non-empty string',
    });
  }
  const rawTimeout = input['timeoutMs'];
  if (
    rawTimeout !== undefined &&
    (typeof rawTimeout !== 'number' || rawTimeout < 500 || rawTimeout > MAX_TIMEOUT_MS)
  ) {
    return err({
      code: 'tool.run_bash.invalid_input',
      message: `timeoutMs must be in [500, ${MAX_TIMEOUT_MS}]`,
    });
  }
  const parsed: RunBashInput = {
    command: rawCommand,
    ...(typeof rawTimeout === 'number' ? { timeoutMs: rawTimeout } : {}),
  };
  return ok(parsed);
}
