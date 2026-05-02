// Estes tipos espelham o shape do kernel (`@g4os/kernel/schemas/message`).
// Mantidos locais aqui para evitar acoplamento da package `features` ao kernel
// nas dependências de tipo, mas SHAPE deve permanecer idêntico — qualquer
// drift vai romper renderização silenciosamente (text vs thinking, id vs
// toolUseId, etc). Se mudar aqui, sincronize com o kernel.
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ThinkingBlock {
  readonly type: 'thinking';
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly toolUseId: string;
  readonly toolName: string;
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
  // CR-24 F-CR24-1: discriminator para mensagens role='system'. V1 tinha
  // 4 roles dedicados (`error`/`info`/`warning`/`system`); V2 unifica em
  // role='system' + `systemKind` para variantes visuais. Preserva o shape
  // V1 SystemMessage sem inflar a enum de role no schema canônico.
  readonly systemKind?: 'error' | 'info' | 'warning';
  readonly errorCode?: string;
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly data: Uint8Array;
}
