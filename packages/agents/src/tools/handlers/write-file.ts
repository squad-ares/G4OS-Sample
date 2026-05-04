import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import { err, ok, type Result } from 'neverthrow';
import { resolveInside } from '../shared/path-guard.ts';
import type { ToolFailure, ToolHandler, ToolHandlerResult } from '../types.ts';

interface WriteFileInput {
  readonly path: string;
  readonly content: string;
  readonly createParents?: boolean;
}

const MAX_BYTES = 4 * 1024 * 1024;

export const writeFileHandler: ToolHandler = {
  definition: {
    name: 'write_file',
    description:
      'Create or overwrite a UTF-8 text file inside the working directory. Always prompts for permission.',
    inputSchema: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        createParents: { type: 'boolean' },
      },
    },
  },

  async execute(input, ctx): Promise<ToolHandlerResult> {
    const parsed = parseInput(input);
    if (parsed.isErr()) return err(parsed.error);

    const parsedValue = parsed.value;
    const resolved = resolveInside(ctx.workingDirectory, parsedValue.path, {
      code: 'tool.write_file.path_escape',
    });
    if (resolved.isErr()) return err(resolved.error);
    const target = resolved.value;

    const bytes = Buffer.byteLength(parsedValue.content, 'utf8');
    if (bytes > MAX_BYTES) {
      return err({
        code: 'tool.write_file.too_large',
        message: `content exceeds ${MAX_BYTES} bytes`,
        context: { bytes },
      });
    }

    try {
      if (parsedValue.createParents === true) {
        await mkdir(dirname(target), { recursive: true });
      }
      // CR-30 F-CR30-4: writeAtomic (`tmp → fsync → rename → fsync(dir)`)
      // protege contra crash mid-write deixando arquivo do usuário
      // truncado. CLAUDE.md "writeAtomic substitui o padrão inseguro
      // fs.writeFile" se aplica também a tools — `write_file` reescreve
      // arquivos do projeto do usuário; trabalho perdido é mais visível
      // que credencial corrompida.
      //
      // AbortSignal não é honrado por writeAtomic (escrita sub-1ms em SSD
      // cobre o gap). Caller que precisar cancelar usa o signal externo
      // pra impedir chamadas subsequentes — race-window aqui é negligível.
      if (ctx.signal.aborted) {
        return err({
          code: 'tool.write_file.aborted',
          message: 'write aborted before start',
        });
      }
      await writeAtomic(target, parsedValue.content);
      return ok({
        output: `wrote ${bytes} bytes to ${target}`,
        metadata: { path: target, bytes },
      });
    } catch (error) {
      return err({
        code: 'tool.write_file.failed',
        message: error instanceof Error ? error.message : String(error),
        context: { path: target },
      });
    }
  },
};

function parseInput(input: Readonly<Record<string, unknown>>): Result<WriteFileInput, ToolFailure> {
  const rawPath = input['path'];
  const rawContent = input['content'];
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return err({
      code: 'tool.write_file.invalid_input',
      message: 'path must be a non-empty string',
    });
  }
  if (typeof rawContent !== 'string') {
    return err({ code: 'tool.write_file.invalid_input', message: 'content must be a string' });
  }
  const rawCreateParents = input['createParents'];
  if (rawCreateParents !== undefined && typeof rawCreateParents !== 'boolean') {
    return err({
      code: 'tool.write_file.invalid_input',
      message: 'createParents must be boolean when provided',
    });
  }
  const parsed: WriteFileInput = {
    path: rawPath,
    content: rawContent,
    ...(typeof rawCreateParents === 'boolean' ? { createParents: rawCreateParents } : {}),
  };
  return ok(parsed);
}
