export interface AccumulatedToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsText: string;
}

interface AccumulatorEntry {
  id: string;
  idSet: boolean;
  name: string;
  nameSet: boolean;
  args: string;
}

export class OpenAIToolAccumulator {
  private readonly byIndex = new Map<number, AccumulatorEntry>();

  // CR8-23: usar flags `idSet`/`nameSet` em vez de checar `length === 0`. O
  // OpenAI streaming pode mandar `id: ''` em delta inicial e o id verdadeiro
  // num delta seguinte — o check antigo (`existing.id.length === 0`) ainda
  // tratava `''` como "não setado" mas era frágil: qualquer caller que
  // intencionalmente quisesse setar `id: ''` ficava bloqueado.
  pushDelta(index: number, id?: string, name?: string, argumentsChunk?: string): void {
    const existing = this.byIndex.get(index);
    if (existing === undefined) {
      this.byIndex.set(index, {
        id: id ?? '',
        idSet: id !== undefined,
        name: name ?? '',
        nameSet: name !== undefined,
        args: argumentsChunk ?? '',
      });
      return;
    }
    if (id !== undefined && !existing.idSet) {
      existing.id = id;
      existing.idSet = true;
    }
    if (name !== undefined && !existing.nameSet) {
      existing.name = name;
      existing.nameSet = true;
    }
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
