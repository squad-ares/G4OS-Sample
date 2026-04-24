/**
 * Adapter: `MountedSource[]` → `ToolHandler[]` + `ToolDefinition[]`.
 *
 * Cada tool exposto por um source virado "mcp tool" ganha nome com namespace
 * determinístico `mcp_<slug>__<toolname>` para:
 *   - Evitar colisão com tools built-in (`read_file`, `list_dir`, `run_bash`
 *     etc.) ou entre sources distintos.
 *   - Respeitar o padrão de nome aceito pela Anthropic Tools API
 *     (`^[a-zA-Z0-9_-]+$`) — garantimos que `slug`/`toolname` sem caracteres
 *     inválidos são passados direto; qualquer char fora do set é substituído
 *     por `_` durante a construção do namespace.
 *
 * A execução do handler:
 *   1. Resolve `(slug, tool)` a partir do namespaced name.
 *   2. Chama `source.callTool(name, input, signal)` e coleta a primeira
 *      emissão do Observable como resultado (fonte atual emite uma única vez
 *      e completa). Em error → `ToolFailure`.
 *   3. Retorna `ToolSuccess` com conteúdo serializado em string.
 */

import type { ToolHandler, ToolHandlerResult } from '@g4os/agents/tools';
import { err, ok } from 'neverthrow';
import { firstValueFrom } from 'rxjs';
import type { ISource, ToolDefinition } from '../interface/index.ts';
import type { MountedSource } from './mount-registry.ts';

const NAMESPACE_PREFIX = 'mcp_';
const NAMESPACE_SEP = '__';

export interface MountedToolHandlersOutput {
  readonly handlers: readonly ToolHandler[];
  readonly definitions: readonly ToolDefinition[];
}

export function buildMountedToolHandlers(
  mounted: readonly MountedSource[],
): MountedToolHandlersOutput {
  const handlers: ToolHandler[] = [];
  const definitions: ToolDefinition[] = [];

  for (const m of mounted) {
    const safeSlug = sanitize(m.slug);
    for (const tool of m.tools) {
      const safeName = sanitize(tool.name);
      const namespacedName = `${NAMESPACE_PREFIX}${safeSlug}${NAMESPACE_SEP}${safeName}`;
      const definition: ToolDefinition = {
        name: namespacedName,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      definitions.push(definition);
      handlers.push(makeHandler(namespacedName, tool.name, m.source, definition));
    }
  }

  return { handlers, definitions };
}

function makeHandler(
  namespacedName: string,
  originalName: string,
  source: ISource,
  definition: ToolDefinition,
): ToolHandler {
  return {
    definition,
    async execute(input, ctx): Promise<ToolHandlerResult> {
      try {
        const result = await firstValueFrom(source.callTool(originalName, input, ctx.signal));
        if (result.isError) {
          return err({
            code: `tool.${namespacedName}.runtime_error`,
            message: serializeContent(result.content),
            ...(result.metadata ? { context: result.metadata } : {}),
          });
        }
        return ok({
          output: serializeContent(result.content),
          ...(result.metadata ? { metadata: result.metadata } : {}),
        });
      } catch (e) {
        return err({
          code: `tool.${namespacedName}.dispatch_error`,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
  };
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function serializeContent(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}
