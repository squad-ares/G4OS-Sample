import type { ThinkingLevel } from '../interface/agent.ts';

export type GeminiTurnStrategy =
  | 'native_search'
  | 'native_url_context'
  | 'native_youtube'
  | 'custom_tools';

export type GeminiThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface GeminiThinkingConfig {
  readonly thinkingBudget?: number;
  readonly thinkingLevel?: GeminiThinkingLevel;
}

export interface GeminiStreamParams {
  readonly model: string;
  readonly systemInstruction?: string;
  readonly contents: readonly GeminiContent[];
  readonly tools?: readonly GeminiTool[];
  readonly thinkingConfig?: GeminiThinkingConfig;
  readonly strategy?: GeminiTurnStrategy;
}

export interface GeminiContent {
  readonly role: 'user' | 'model';
  readonly parts: readonly GeminiPart[];
}

export type GeminiPart =
  | { readonly text: string }
  | { readonly fileData: { readonly mimeType: string; readonly fileUri: string } }
  | { readonly inlineData: { readonly mimeType: string; readonly data: string } }
  | {
      readonly functionCall: {
        readonly name: string;
        readonly args: Readonly<Record<string, unknown>>;
      };
    }
  | {
      readonly functionResponse: {
        readonly name: string;
        readonly response: Readonly<Record<string, unknown>>;
      };
    };

export interface GeminiTool {
  readonly googleSearch?: Record<string, never>;
  readonly urlContext?: Record<string, never>;
  readonly codeExecution?: Record<string, never>;
  readonly functionDeclarations?: readonly GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export type GeminiStreamChunk =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'thinking_delta'; readonly text: string }
  | {
      readonly type: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly args: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'usage';
      readonly input: number;
      readonly output: number;
      readonly thinkingTokens?: number;
    }
  | { readonly type: 'done'; readonly finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'OTHER' };

export interface GeminiProviderCallContext {
  readonly signal: AbortSignal;
}

export interface GeminiProvider {
  openStream(
    params: GeminiStreamParams,
    context: GeminiProviderCallContext,
  ): Promise<AsyncIterable<GeminiStreamChunk>>;
  classifyTurn(text: string, modelId: string, signal: AbortSignal): Promise<GeminiTurnStrategy>;
}

export interface GeminiRequestOptions {
  readonly thinkingLevel?: ThinkingLevel;
  readonly apiKey?: string;
  readonly strategy?: GeminiTurnStrategy;
}

/**
 * FNV-1a (32-bit) of `input`, returned as base-36 string.
 * Bit-identical to the V1 hashToolName() in pi-agent.ts.
 */
function fnv1aBase36(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Build the canonical (stateless) safe name for a tool.
 * Format: g4_<normalizedBase>_<hash8>
 * No collision resolution — always the same result for the same input.
 * Used for history remapping (where the same name must be idempotent).
 */
export function toGeminiSafeToolName(name: string): string {
  const normalized = name
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[^A-Za-z_]+/, '')
    .replace(/_+/g, '_')
    .replace(/\.+/g, '.')
    .replace(/-+/g, '-')
    .replace(/^[_.-]+/, '');

  const hash = fnv1aBase36(name).slice(0, 8);
  const base = normalized.length > 0 ? normalized : 'tool';
  const maxBaseLength = 63 - 'g4_'.length - 1 - hash.length;
  return `g4_${base.slice(0, maxBaseLength)}_${hash}`;
}

/**
 * Build a Gemini-safe tool name with collision detection.
 * Used for tool DECLARATIONS within a single request.
 * Bit-identical to buildGeminiSafeToolName() in V1 pi-agent.ts.
 * `usedNames` must be a per-request Set (never reused across turns).
 */
export function toGeminiSafeToolNameUnique(name: string, usedNames: Set<string>): string {
  let candidate = toGeminiSafeToolName(name);
  let counter = 1;

  while (usedNames.has(candidate)) {
    const hash = fnv1aBase36(name).slice(0, 8);
    const normalized = name
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^[^A-Za-z_]+/, '')
      .replace(/_+/g, '_')
      .replace(/\.+/g, '.')
      .replace(/-+/g, '-')
      .replace(/^[_.-]+/, '');
    const base = normalized.length > 0 ? normalized : 'tool';
    const suffix = `_${counter}`;
    const maxBaseLength = 63 - 'g4_'.length - 1 - hash.length;
    const truncatedBase = base.slice(0, Math.max(1, maxBaseLength - suffix.length));
    candidate = `g4_${truncatedBase}_${hash}${suffix}`;
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
}
