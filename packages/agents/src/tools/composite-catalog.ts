/**
 * `composeCatalogs` — view read-only que sobrepoe múltiplos `ToolCatalog`.
 *
 * Regra de lookup: busca em ordem; primeiro `get(name)` ganha. `list()`
 * concatena preservando ordem — na duplicidade a primeira definição sobrevive.
 *
 * Uso típico: base `ToolRegistry` (list_dir, read_file, activate_sources, …)
 * + um conjunto de handlers dinâmicos (ex: tools de `McpMountRegistry`)
 * montados no início do turn. A composite não é registrada — é uma view
 * estática sobre entradas já existentes.
 */

import type { ToolDefinition } from '@g4os/kernel';
import type { ToolCatalog, ToolHandler } from './types.ts';

export function composeCatalogs(...catalogs: readonly ToolCatalog[]): ToolCatalog {
  return {
    list(): readonly ToolDefinition[] {
      const seen = new Set<string>();
      const out: ToolDefinition[] = [];
      for (const c of catalogs) {
        for (const def of c.list()) {
          if (seen.has(def.name)) continue;
          seen.add(def.name);
          out.push(def);
        }
      }
      return out;
    },
    get(name: string): ToolHandler | undefined {
      for (const c of catalogs) {
        const h = c.get(name);
        if (h) return h;
      }
      return undefined;
    },
  };
}
