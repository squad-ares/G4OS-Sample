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

/** Build a Gemini-safe tool name: [A-Za-z0-9_.] max 64 chars, prefixed g4_ */
export function toGeminiSafeToolName(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9_.]/g, '_').slice(0, 60);
  return `g4_${sanitized}`;
}
