import type { CodexRequest, CodexResponseEvent, CodexResponseEventType } from './protocol.ts';
import { CODEX_RESPONSE_EVENT_TYPES } from './protocol.ts';

/**
 * Contrato de encoder de frames NDJSON. Definido aqui (consumer) pois
 * nenhum outro módulo externo a `app-server/` programa contra esta interface
 * — manter em `@g4os/codex-types` seria surface desnecessária sem caller
 * externo (F-CR34-8).
 */
export interface CodexFrameEncoder {
  encode(message: CodexRequest): string;
}

/**
 * Contrato de decoder de frames NDJSON. Ver `CodexFrameEncoder` acima.
 */
export interface CodexFrameDecoder {
  decode(line: string): CodexResponseEvent | undefined;
}

// CR-38 F-CR38-3: gate runtime construído a partir da constante canônica
// em `@g4os/codex-types` (re-exportada via `protocol.ts`). Adicionar
// event type novo em `CodexResponseEvent` sem atualizar
// `CODEX_RESPONSE_EVENT_TYPES` (ou vice-versa) quebra o build via
// `satisfies` no codex-types — drift silencioso eliminado, frames novos
// não viram mais `schema_error` por esquecimento de update do gate.
const VALID_EVENT_TYPES: ReadonlySet<CodexResponseEventType> = new Set(CODEX_RESPONSE_EVENT_TYPES);

export const jsonLineEncoder: CodexFrameEncoder = {
  encode(message: CodexRequest): string {
    return `${JSON.stringify(message)}\n`;
  },
};

export type DecodeResult =
  | { readonly ok: true; readonly event: CodexResponseEvent }
  | { readonly ok: false; readonly kind: 'parse_error' | 'schema_error'; readonly line: string }
  | { readonly ok: false; readonly kind: 'empty' };

export const jsonLineDecoder: CodexFrameDecoder = {
  decode(line: string): CodexResponseEvent | undefined {
    const r = decodeFrame(line);
    return r.ok ? r.event : undefined;
  },
};

/**
 * Variante estruturada do decoder: distingue `parse_error` (linha não é
 * JSON válido) de `schema_error` (JSON ok mas type/requestId fora do
 * contrato). Permite ao caller logar/medir cada tipo separadamente —
 * ADR-0072 (observabilidade de protocol failure).
 */
export function decodeFrame(line: string): DecodeResult {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { ok: false, kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, kind: 'parse_error', line: trimmed };
  }
  if (!isEventShape(parsed)) return { ok: false, kind: 'schema_error', line: trimmed };
  return { ok: true, event: parsed };
}

function isEventShape(value: unknown): value is CodexResponseEvent {
  if (!value || typeof value !== 'object') return false;
  const obj = value as { type?: unknown; requestId?: unknown };
  if (typeof obj.type !== 'string') return false;
  if (typeof obj.requestId !== 'string') return false;
  return VALID_EVENT_TYPES.has(obj.type as CodexResponseEventType);
}

/**
 * Buffer simples para framing por newline. Acumula chunks parciais até
 * encontrar `\n` e devolve linhas completas. Resíduo (chunk sem newline
 * final) fica em `buffer` até o próximo `push`.
 *
 * **Performance:** `push` chama `buffer.slice(0, idx)` +
 * `buffer.slice(idx + 1)` por linha — O(n²) no pior caso de stream com
 * muitas linhas grandes. Codex stdout é limitado por modelo (raramente
 * > 100KB por turno), então O(n²) cabe no orçamento. Refator para acúmulo
 * via array de chunks só vale se streams crescerem 10×+. Documentado
 * defensivamente — não regressar para `String.prototype.replace` ou regex
 * sem benchmark mostrando ganho.
 */
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
