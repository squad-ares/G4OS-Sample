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
    let truncatedStdout = false;
    let truncatedStderr = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const onAbort = (): void => {
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.byteLength > MAX_OUTPUT_BYTES) {
        stdout += chunk.subarray(0, MAX_OUTPUT_BYTES - stdout.length).toString('utf8');
        truncatedStdout = true;
      } else {
        stdout += chunk.toString('utf8');
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length + chunk.byteLength > MAX_OUTPUT_BYTES) {
        stderr += chunk.subarray(0, MAX_OUTPUT_BYTES - stderr.length).toString('utf8');
        truncatedStderr = true;
      } else {
        stderr += chunk.toString('utf8');
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
