/**
 * Custom tRPC link que injeta um header W3C `traceparent` em cada operação
 * antes do `ipcLink` serializar pra IPC. Permite correlacionar spans do
 * renderer com spans do main process via OTel.
 *
 * Como electron-trpc não tem campo `headers` no envelope, escondemos o
 * traceparent dentro do próprio `op.input` num wrapper sentinel — o
 * handler em `electron-ipc-handler.ts` detecta o wrapper, extrai o trace
 * e descompacta o input antes de chamar a procedure. Procedures não
 * enxergam o wrapper.
 *
 * Sem SDK OTel registrado no renderer, geramos um `traceparent` simples
 * com IDs aleatórios — main ainda consegue iniciar span filho via
 * `propagation.extract`. Quando o renderer ganhar SDK próprio, basta
 * trocar `mintTraceparent()` por `propagation.inject(context.active(), ...)`.
 */

import type { AppRouter } from '@g4os/ipc/server';
import type { TRPCLink } from '@trpc/client';

export const G4OS_TRACE_INPUT_KEY = '__g4os_traceparent';
export const G4OS_INPUT_WRAPPED_KEY = '__input';

export function tracingLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ op, next }) => {
      const traceparent = mintTraceparent();
      const wrapped = {
        ...op,
        input: { [G4OS_TRACE_INPUT_KEY]: traceparent, [G4OS_INPUT_WRAPPED_KEY]: op.input },
      };
      return next(wrapped);
    };
  };
}

/**
 * Gera um W3C `traceparent` com versão 00 + traceId 16 bytes hex + spanId
 * 8 bytes hex + flags `01` (sampled). Usa `crypto.randomUUID()` quando
 * disponível pra ID forte; senão fallback `Math.random()`.
 */
function mintTraceparent(): string {
  const traceId = randomHex(32);
  const spanId = randomHex(16);
  return `00-${traceId}-${spanId}-01`;
}

function randomHex(length: number): string {
  const bytes = length / 2;
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    cryptoRef.getRandomValues(arr);
    let out = '';
    for (const b of arr) out += b.toString(16).padStart(2, '0');
    return out;
  }
  let out = '';
  while (out.length < length) {
    out += Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return out.slice(0, length);
}
