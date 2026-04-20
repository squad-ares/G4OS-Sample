import type { AgentDoneReason, AgentEvent } from '../../interface/agent.ts';
import type { GeminiStreamChunk } from '../types.ts';
import { toGeminiSafeToolName } from '../types.ts';

export class GeminiEventMapper {
  private readonly reverseCache = new Map<string, string>();

  registerOriginalToolName(original: string): void {
    this.reverseCache.set(toGeminiSafeToolName(original), original);
  }

  resolveOriginalToolName(safeName: string): string {
    return this.reverseCache.get(safeName) ?? safeName;
  }

  mapChunk(chunk: GeminiStreamChunk): readonly AgentEvent[] {
    return mapGeminiChunkWithResolver(chunk, (name) => this.resolveOriginalToolName(name));
  }
}

export function mapGeminiFinish(
  reason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'OTHER',
): AgentDoneReason {
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  return 'stop';
}

export function mapGeminiChunk(chunk: GeminiStreamChunk): readonly AgentEvent[] {
  return mapGeminiChunkWithResolver(chunk, (name) => name);
}

function mapGeminiChunkWithResolver(
  chunk: GeminiStreamChunk,
  resolveToolName: (safeName: string) => string,
): readonly AgentEvent[] {
  switch (chunk.type) {
    case 'text_delta':
      return [{ type: 'text_delta', text: chunk.text }];

    case 'thinking_delta':
      return [{ type: 'thinking_delta', text: chunk.text }];

    case 'tool_call': {
      const toolUseId = chunk.id;
      const originalName = resolveToolName(chunk.name);
      return [
        { type: 'tool_use_start', toolUseId, toolName: originalName },
        {
          type: 'tool_use_complete',
          toolUseId,
          input: chunk.args,
        },
      ];
    }

    case 'usage':
      return [
        {
          type: 'usage',
          input: chunk.input,
          output: chunk.output,
        },
      ];

    case 'done':
      return [{ type: 'done', reason: mapGeminiFinish(chunk.finishReason) }];

    default: {
      const _exhaustive: never = chunk;
      void _exhaustive;
      return [];
    }
  }
}
