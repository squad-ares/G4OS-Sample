import type {
  CodexFrameDecoder,
  CodexFrameEncoder,
  CodexRequest,
  CodexResponseEvent,
  CodexResponseEventType,
} from './protocol.ts';

const VALID_EVENT_TYPES: ReadonlySet<CodexResponseEventType> = new Set([
  'ack',
  'turn_started',
  'text_delta',
  'thinking_delta',
  'tool_use_start',
  'tool_use_input_delta',
  'tool_use_complete',
  'usage',
  'turn_finished',
  'error',
]);

export const jsonLineEncoder: CodexFrameEncoder = {
  encode(message: CodexRequest): string {
    return `${JSON.stringify(message)}\n`;
  },
};

export const jsonLineDecoder: CodexFrameDecoder = {
  decode(line: string): CodexResponseEvent | undefined {
    const trimmed = line.trim();
    if (trimmed.length === 0) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
    if (!isEventShape(parsed)) return undefined;
    return parsed;
  },
};

function isEventShape(value: unknown): value is CodexResponseEvent {
  if (!value || typeof value !== 'object') return false;
  const obj = value as { type?: unknown; requestId?: unknown };
  if (typeof obj.type !== 'string') return false;
  if (typeof obj.requestId !== 'string') return false;
  return VALID_EVENT_TYPES.has(obj.type as CodexResponseEventType);
}

export class LineBuffer {
  private buffer = '';

  push(chunk: string): readonly string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let idx = this.buffer.indexOf('\n');
    while (idx !== -1) {
      lines.push(this.buffer.slice(0, idx));
      this.buffer = this.buffer.slice(idx + 1);
      idx = this.buffer.indexOf('\n');
    }
    return lines;
  }

  flush(): string | undefined {
    if (this.buffer.length === 0) return undefined;
    const remaining = this.buffer;
    this.buffer = '';
    return remaining;
  }
}
