import type { SessionId, ToolDefinition } from '@g4os/kernel';
import type { Result } from 'neverthrow';

export interface ToolContext {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
}

export interface ToolFailure {
  readonly code: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface ToolSuccess {
  readonly output: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ToolHandlerResult = Result<ToolSuccess, ToolFailure>;

export interface ToolHandler {
  readonly definition: ToolDefinition;
  execute(input: Readonly<Record<string, unknown>>, ctx: ToolContext): Promise<ToolHandlerResult>;
}

export interface ToolCatalog {
  readonly list: () => readonly ToolDefinition[];
  readonly get: (name: string) => ToolHandler | undefined;
}
