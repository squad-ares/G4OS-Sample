import { AgentError } from '@g4os/kernel/errors';
import { CLASSIFIER_SYSTEM_PROMPT } from '../config/mapper.ts';
import type {
  GeminiProvider,
  GeminiStreamChunk,
  GeminiStreamParams,
  GeminiTurnStrategy,
} from '../types.ts';

export interface GenAIProviderOptions {
  readonly apiKey: string;
  readonly sdkFactory?: () => Promise<GoogleGenAISdkLike>;
}

export interface GoogleGenAISdkLike {
  generateContentStream(params: GoogleStreamRequest): Promise<AsyncIterable<GoogleStreamChunk>>;
  /**
   * CR-18 F-AG4: aceita `signal` opcional para cancelar a chamada do
   * classifier antes do round-trip HTTP completar. Sem isso, abort
   * mid-flight só era detectado APÓS a resposta voltar — usuário cancelava
   * o turn, classifier seguia rodando até timeout do provider.
   */
  generateContent(
    params: GoogleStreamRequest,
    options?: { signal?: AbortSignal },
  ): Promise<{ text?: string }>;
}

interface GoogleStreamRequest {
  model: string;
  contents: unknown[];
  config?: {
    systemInstruction?: string;
    tools?: unknown[];
    thinkingConfig?: unknown;
    // ADR-0075 / F-CR31-8: @google/genai aceita temperature em
    // generationConfig — passado diretamente no config do request.
    temperature?: number;
  };
}

interface GoogleStreamChunk {
  text?: string;
  candidates?: ReadonlyArray<{
    content?: {
      parts?: ReadonlyArray<{
        text?: string;
        thought?: boolean;
        functionCall?: { name: string; args: Record<string, unknown> };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export class GenAIProvider implements GeminiProvider {
  constructor(private readonly options: GenAIProviderOptions) {}

  async openStream(
    params: GeminiStreamParams,
    context: { signal: AbortSignal },
  ): Promise<AsyncIterable<GeminiStreamChunk>> {
    const sdk = await this.resolveSdk();
    const rawStream = await sdk.generateContentStream(buildRequest(params));
    return adaptStream(rawStream, context.signal);
  }

  async classifyTurn(
    text: string,
    modelId: string,
    signal: AbortSignal,
  ): Promise<GeminiTurnStrategy> {
    const sdk = await this.resolveSdk();
    // CR-18 F-AG4: passa o signal para o SDK — provider que suporta
    // cancela na rede; o que não suporta apenas ignora o option (Gemini
    // SDK em adapter NodeHttp não cancela, mas opt-in está no contrato).
    const response = await sdk.generateContent(
      {
        model: modelId.replace(/^pi\//, ''),
        contents: [{ role: 'user', parts: [{ text }] }],
        config: { systemInstruction: CLASSIFIER_SYSTEM_PROMPT },
      },
      { signal },
    );

    if (signal.aborted) throw AgentError.network('google', { reason: 'aborted' });

    const raw = response.text?.trim() ?? '';
    return parseClassifierResponse(raw);
  }

  private resolveSdk(): Promise<GoogleGenAISdkLike> {
    if (this.options.sdkFactory !== undefined) {
      return this.options.sdkFactory();
    }
    return loadDefaultSdk(this.options.apiKey);
  }
}

async function loadDefaultSdk(apiKey: string): Promise<GoogleGenAISdkLike> {
  const specifier = '@google/genai';
  const mod = (await import(/* @vite-ignore */ specifier)) as {
    GoogleGenAI: new (args: {
      apiKey: string;
    }) => {
      models: {
        generateContentStream(
          params: GoogleStreamRequest,
        ): Promise<{ stream: AsyncIterable<GoogleStreamChunk> }>;
        generateContent(params: GoogleStreamRequest): Promise<{ text?: string }>;
      };
    };
  };
  const ai = new mod.GoogleGenAI({ apiKey });
  return {
    async generateContentStream(params) {
      const { stream } = await ai.models.generateContentStream(params);
      return stream;
    },
    generateContent(params) {
      return ai.models.generateContent(params);
    },
  };
}

function buildRequest(params: GeminiStreamParams): GoogleStreamRequest {
  return {
    model: params.model,
    contents: params.contents as unknown[],
    config: {
      ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
      ...(params.tools && params.tools.length > 0 ? { tools: params.tools as unknown[] } : {}),
      ...(params.thinkingConfig ? { thinkingConfig: params.thinkingConfig } : {}),
      ...(params.temperature === undefined ? {} : { temperature: params.temperature }),
    },
  };
}

async function* adaptStream(
  raw: AsyncIterable<GoogleStreamChunk>,
  signal: AbortSignal,
): AsyncIterable<GeminiStreamChunk> {
  const context = { toolCallCounter: 0 };
  for await (const chunk of raw) {
    if (signal.aborted) {
      yield { type: 'done', finishReason: 'OTHER' };
      return;
    }

    for (const candidate of chunk.candidates ?? []) {
      yield* processCandidate(candidate, context);
    }

    if (chunk.usageMetadata) {
      yield {
        type: 'usage',
        input: chunk.usageMetadata.promptTokenCount ?? 0,
        output: chunk.usageMetadata.candidatesTokenCount ?? 0,
        ...(chunk.usageMetadata.thoughtsTokenCount
          ? { thinkingTokens: chunk.usageMetadata.thoughtsTokenCount }
          : {}),
      };
    }
  }
}

function* processCandidate(
  candidate: NonNullable<GoogleStreamChunk['candidates']>[number],
  context: { toolCallCounter: number },
): Iterable<GeminiStreamChunk> {
  for (const part of candidate.content?.parts ?? []) {
    if (part.text && !part.thought) {
      yield { type: 'text_delta', text: part.text };
    } else if (part.text && part.thought) {
      yield { type: 'thinking_delta', text: part.text };
    } else if (part.functionCall) {
      const id = `call_${++context.toolCallCounter}`;
      yield {
        type: 'tool_call',
        id,
        name: part.functionCall.name,
        args: part.functionCall.args,
      };
    }
  }
  if (candidate.finishReason) {
    const reason = normalizeFinish(candidate.finishReason);
    yield { type: 'done', finishReason: reason };
  }
}

function normalizeFinish(reason: string): 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'OTHER' {
  if (reason === 'STOP') return 'STOP';
  if (reason === 'MAX_TOKENS') return 'MAX_TOKENS';
  if (reason === 'SAFETY') return 'SAFETY';
  return 'OTHER';
}

function parseClassifierResponse(text: string): GeminiTurnStrategy {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { strategy?: unknown };
    const s = parsed.strategy;
    if (
      s === 'native_url_context' ||
      s === 'native_search' ||
      s === 'native_youtube' ||
      s === 'custom_tools'
    )
      return s;
  } catch {
    // fall through to token scan
  }

  if (/native_url_context/i.test(cleaned)) return 'native_url_context';
  if (/native_search/i.test(cleaned)) return 'native_search';
  if (/native_youtube/i.test(cleaned)) return 'native_youtube';
  return 'custom_tools';
}
