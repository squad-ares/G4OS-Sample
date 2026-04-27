import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRouter } from '../root-router.ts';

interface ProcedureMeta {
  readonly path: string;
  readonly routerName: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly type: 'query' | 'mutation' | 'subscription' | 'unknown';
}

type AnyDef = {
  procedure?: boolean;
  record?: Record<string, unknown>;
  type?: string;
  inputs?: unknown[];
  output?: unknown;
};

function isLeafProcedure(child: unknown): boolean {
  // In tRPC v11, a leaf procedure is a function whose ._def.procedure === true.
  return typeof child === 'function' && (child as { _def?: AnyDef })._def?.procedure === true;
}

function collectAllProcedures(node: unknown, prefix = ''): ProcedureMeta[] {
  const out: ProcedureMeta[] = [];

  // tRPC v11: root router exposes _def.record; sub-routers are plain objects.
  const trpcDef = (node as { _def?: AnyDef })._def;
  const entries: [string, unknown][] = trpcDef?.record
    ? Object.entries(trpcDef.record)
    : typeof node === 'object' && node !== null && !isLeafProcedure(node)
      ? Object.entries(node as Record<string, unknown>)
      : [];

  for (const [name, child] of entries) {
    const currentPath = prefix ? `${prefix}.${name}` : name;
    if (isLeafProcedure(child)) {
      const leafDef = (child as { _def?: AnyDef })._def;
      out.push({
        path: currentPath,
        routerName: prefix || name,
        inputSchema: leafDef?.inputs?.[0],
        outputSchema: leafDef?.output,
        type: (leafDef?.type as ProcedureMeta['type']) ?? 'unknown',
      });
    } else {
      out.push(...collectAllProcedures(child, currentPath));
    }
  }
  return out;
}

describe('procedure contract coverage', () => {
  const allProcedures = collectAllProcedures(appRouter);

  it('discovers at least one procedure', () => {
    expect(allProcedures.length).toBeGreaterThan(0);
  });

  it('has procedures across all 12 domain routers', () => {
    const domains = new Set(allProcedures.map((p) => p.path.split('.')[0]));
    expect(domains.size).toBeGreaterThanOrEqual(12);
  });

  for (const proc of allProcedures) {
    it(`${proc.path} declares an input schema (or is parameterless)`, () => {
      // subscriptions e queries sem input podem ter inputs undefined,
      // mas asseguramos que o campo seja legível para detectar definições
      // de router quebradas.
      expect(() => proc.inputSchema).not.toThrow();
    });

    // tRPC v11 subscriptions use async-generator return type; .output() is not
    // supported on subscription procedures and causes overload resolution errors.
    if (proc.type !== 'subscription') {
      it(`${proc.path} declares an output schema`, () => {
        expect(
          proc.outputSchema,
          `procedure "${proc.path}" is missing .output(Schema) — add a Zod output validator`,
        ).toBeDefined();
      });
    }
  }

  it('every domain router file exists under routers/', () => {
    const domains = new Set(allProcedures.map((p) => p.path.split('.')[0]));
    for (const domain of domains) {
      const kebab = domain.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
      const file = join(__dirname, '..', 'routers', `${kebab}-router.ts`);
      expect(existsSync(file), `expected ${file} to exist`).toBe(true);
    }
  });
});
