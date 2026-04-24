/**
 * Wrapper sobre o `ipcLink` do `electron-trpc` que normaliza a API de
 * transformer entre tRPC v10 (flat: `{ serialize, deserialize }`) e
 * tRPC v11 (combined: `{ input: { serialize }, output: { deserialize } }`).
 *
 * electron-trpc@0.7.1 foi escrito para tRPC v10 e chama
 * `runtime.transformer.serialize` diretamente. Em tRPC v11 o runtime
 * repassa um CombinedDataTransformer sem `.serialize` no nível raiz,
 * o que causaria "Cannot read properties of undefined (reading 'serialize')".
 */

import type { AppRouter } from '@g4os/ipc/server';
import type { TRPCLink } from '@trpc/client';
import { ipcLink as _ipcLink } from 'electron-trpc/renderer';
import superjson from 'superjson';

type FlatTransformer = {
  serialize(v: unknown): unknown;
  deserialize(v: unknown): unknown;
};

type CombinedTransformer = {
  input?: { serialize?(v: unknown): unknown };
  output?: { deserialize?(v: unknown): unknown };
};

function normalizeFlatTransformer(t: unknown): FlatTransformer {
  const asFlat = t as FlatTransformer | null | undefined;
  if (asFlat !== null && asFlat !== undefined && typeof asFlat.serialize === 'function') {
    return asFlat;
  }
  const combined = t as CombinedTransformer | null | undefined;
  return {
    serialize:
      combined?.input?.serialize?.bind(combined.input) ?? superjson.serialize.bind(superjson),
    deserialize:
      combined?.output?.deserialize?.bind(combined.output) ?? superjson.deserialize.bind(superjson),
  };
}

export function ipcLink(): TRPCLink<AppRouter> {
  return (runtime) => {
    const transformer = (runtime as Record<string, unknown>)['transformer'];
    const flat = normalizeFlatTransformer(transformer);
    return _ipcLink()({ ...runtime, transformer: flat } as typeof runtime);
  };
}
