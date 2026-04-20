export interface AccumulatedToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsText: string;
}

export class OpenAIToolAccumulator {
  private readonly byIndex = new Map<number, { id: string; name: string; args: string }>();

  pushDelta(index: number, id?: string, name?: string, argumentsChunk?: string): void {
    const existing = this.byIndex.get(index);
    if (existing === undefined) {
      this.byIndex.set(index, {
        id: id ?? '',
        name: name ?? '',
        args: argumentsChunk ?? '',
      });
      return;
    }
    if (id !== undefined && existing.id.length === 0) existing.id = id;
    if (name !== undefined && existing.name.length === 0) existing.name = name;
    if (argumentsChunk !== undefined) existing.args += argumentsChunk;
  }

  has(index: number): boolean {
    return this.byIndex.has(index);
  }

  finalize(): readonly AccumulatedToolCall[] {
    const out: AccumulatedToolCall[] = [];
    const indexes = [...this.byIndex.keys()].sort((a, b) => a - b);
    for (const i of indexes) {
      const entry = this.byIndex.get(i);
      if (entry === undefined) continue;
      out.push({ id: entry.id, name: entry.name, argumentsText: entry.args });
    }
    return out;
  }

  parseInput(argumentsText: string): Record<string, unknown> {
    if (argumentsText.length === 0) return {};
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { _raw: argumentsText };
    }
    return {};
  }
}
