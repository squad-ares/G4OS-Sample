export type MessageRole = 'user' | 'assistant' | 'system';

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ThinkingBlock {
  readonly type: 'thinking';
  readonly thinking: string;
}

export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResultBlock {
  readonly type: 'tool_result';
  readonly toolUseId: string;
  readonly content: string | ReadonlyArray<{ type: 'text'; text: string }>;
  readonly isError?: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: ReadonlyArray<ContentBlock>;
  readonly createdAt: number;
  readonly isStreaming?: boolean;
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly data: Uint8Array;
}
