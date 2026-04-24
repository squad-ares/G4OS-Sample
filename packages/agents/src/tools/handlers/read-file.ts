import { readFile } from 'node:fs/promises';
import { err, ok, type Result } from 'neverthrow';
import { resolveInside } from '../shared/path-guard.ts';
import type { ToolFailure, ToolHandler, ToolHandlerResult } from '../types.ts';

interface ReadFileInput {
  readonly path: string;
  readonly maxBytes?: number;
}

const MAX_DEFAULT_BYTES = 256 * 1024;
const MAX_ABSOLUTE_BYTES = 4 * 1024 * 1024;

export const readFileHandler: ToolHandler = {
  definition: {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the session working directory.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Relative path (from working dir) or absolute path inside it.',
        },
        encoding: { type: 'string', enum: ['utf8', 'utf-8'] },
        maxBytes: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ABSOLUTE_BYTES,
          description: 'Cap on bytes returned (default 256 KiB).',
        },
      },
    },
  },

  async execute(input, ctx): Promise<ToolHandlerResult> {
    const parsed = parseInput(input);
    if (parsed.isErr()) return err(parsed.error);

    const resolved = resolveInside(ctx.workingDirectory, parsed.value.path, {
      code: 'tool.read_file.path_escape',
    });
    if (resolved.isErr()) return err(resolved.error);

    try {
      const bytes = await readFile(resolved.value, {
        signal: ctx.signal,
      });
      const cap = Math.min(parsed.value.maxBytes ?? MAX_DEFAULT_BYTES, MAX_ABSOLUTE_BYTES);
      const sliced = bytes.byteLength > cap ? bytes.subarray(0, cap) : bytes;
      const content = sliced.toString('utf8');
      const truncated = bytes.byteLength > cap;
      return ok({
        output: content,
        metadata: {
          path: resolved.value,
          bytes: bytes.byteLength,
          returnedBytes: sliced.byteLength,
          truncated,
        },
      });
    } catch (error) {
      return err({
        code: 'tool.read_file.failed',
        message: error instanceof Error ? error.message : String(error),
        context: { path: resolved.value },
      });
    }
  },
};

function parseInput(input: Readonly<Record<string, unknown>>): Result<ReadFileInput, ToolFailure> {
  const rawPath = input['path'];
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return err({
      code: 'tool.read_file.invalid_input',
      message: 'path must be a non-empty string',
    });
  }
  const rawMax = input['maxBytes'];
  if (rawMax !== undefined && (typeof rawMax !== 'number' || rawMax <= 0)) {
    return err({ code: 'tool.read_file.invalid_input', message: 'maxBytes must be positive' });
  }
  const parsed: ReadFileInput = {
    path: rawPath,
    ...(typeof rawMax === 'number' ? { maxBytes: rawMax } : {}),
  };
  return ok(parsed);
}
