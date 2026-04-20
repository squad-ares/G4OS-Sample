export interface AccumulatedToolUse {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly rawJson: string;
}

export class ToolUseAccumulator {
  private readonly byIndex = new Map<
    number,
    { toolUseId: string; toolName: string; parts: string[] }
  >();

  start(index: number, toolUseId: string, toolName: string): void {
    this.byIndex.set(index, { toolUseId, toolName, parts: [] });
  }

  appendDelta(index: number, partial: string): void {
    const entry = this.byIndex.get(index);
    if (!entry) return;
    entry.parts.push(partial);
  }

  peek(index: number): { toolUseId: string; toolName: string } | undefined {
    const entry = this.byIndex.get(index);
    if (!entry) return undefined;
    return { toolUseId: entry.toolUseId, toolName: entry.toolName };
  }

  finish(index: number): AccumulatedToolUse | undefined {
    const entry = this.byIndex.get(index);
    if (!entry) return undefined;
    this.byIndex.delete(index);
    return {
      toolUseId: entry.toolUseId,
      toolName: entry.toolName,
      rawJson: entry.parts.join(''),
    };
  }

  clear(): void {
    this.byIndex.clear();
  }
}

export function parseToolInput(rawJson: string): Readonly<Record<string, unknown>> {
  const trimmed = rawJson.trim();
  if (trimmed.length === 0) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
