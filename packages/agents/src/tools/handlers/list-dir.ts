import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import { relativeInside, resolveInside } from '../shared/path-guard.ts';
import type { ToolFailure, ToolHandler, ToolHandlerResult } from '../types.ts';

interface ListDirInput {
  readonly path?: string;
  readonly depth?: number;
}

const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 3;
const MAX_ENTRIES = 500;

export const listDirHandler: ToolHandler = {
  definition: {
    name: 'list_dir',
    description: 'List entries in a directory, optionally recursive up to depth 3.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative or absolute path inside the working directory. Default: working dir root.',
        },
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_DEPTH,
          description: 'Recursion depth (default 1).',
        },
      },
    },
  },

  async execute(input, ctx): Promise<ToolHandlerResult> {
    const parsed = parseInput(input);
    if (parsed.isErr()) return err(parsed.error);

    const resolved = resolveInside(ctx.workingDirectory, parsed.value.path ?? '.', {
      code: 'tool.list_dir.path_escape',
    });
    if (resolved.isErr()) return err(resolved.error);
    const start = resolved.value;

    const depth = parsed.value.depth ?? DEFAULT_DEPTH;
    try {
      const entries = await walk(start, start, depth, ctx.signal);
      const truncated = entries.length > MAX_ENTRIES;
      const returned = truncated ? entries.slice(0, MAX_ENTRIES) : entries;
      return ok({
        output: returned.join('\n'),
        metadata: {
          root: start,
          count: returned.length,
          total: entries.length,
          truncated,
        },
      });
    } catch (error) {
      return err({
        code: 'tool.list_dir.failed',
        message: error instanceof Error ? error.message : String(error),
        context: { path: start },
      });
    }
  },
};

function parseInput(input: Readonly<Record<string, unknown>>): Result<ListDirInput, ToolFailure> {
  const rawPath = input['path'];
  if (rawPath !== undefined && typeof rawPath !== 'string') {
    return err({
      code: 'tool.list_dir.invalid_input',
      message: 'path must be a string when provided',
    });
  }
  const rawDepth = input['depth'];
  if (
    rawDepth !== undefined &&
    (typeof rawDepth !== 'number' || rawDepth < 1 || rawDepth > MAX_DEPTH)
  ) {
    return err({
      code: 'tool.list_dir.invalid_input',
      message: `depth must be an integer in [1, ${MAX_DEPTH}]`,
    });
  }
  const parsed: ListDirInput = {
    ...(typeof rawPath === 'string' ? { path: rawPath } : {}),
    ...(typeof rawDepth === 'number' ? { depth: rawDepth } : {}),
  };
  return ok(parsed);
}

async function walk(
  dir: string,
  base: string,
  depth: number,
  signal: AbortSignal,
): Promise<readonly string[]> {
  if (signal.aborted) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries) {
    if (signal.aborted) break;
    const fullPath = join(dir, entry.name);
    const suffix = entry.isDirectory() ? '/' : '';
    lines.push(`${relativeInside(base, fullPath)}${suffix}`);
    if (entry.isDirectory() && depth > 1) {
      const nested = await walk(fullPath, base, depth - 1, signal);
      lines.push(...nested);
    }
  }
  return lines;
}
