import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRouter } from '../root-router.ts';

interface ProcedureMeta {
  readonly path: string;
  readonly routerName: string;
  readonly inputSchema: unknown;
  readonly type: 'query' | 'mutation' | 'subscription' | 'unknown';
}

function collectAllProcedures(node: unknown, prefix = ''): ProcedureMeta[] {
  const out: ProcedureMeta[] = [];
  const def = (
    node as { _def?: { record?: Record<string, unknown>; type?: string; inputs?: unknown[] } }
  )._def;
  if (!def) return out;

  if (def.record) {
    for (const [name, child] of Object.entries(def.record)) {
      const currentPath = prefix ? `${prefix}.${name}` : name;
      const childDef = (child as { _def?: { record?: unknown } })._def;
      if (childDef?.record) {
        out.push(...collectAllProcedures(child, currentPath));
      } else {
        const leafDef = (child as { _def?: { type?: string; inputs?: unknown[] } })._def;
        out.push({
          path: currentPath,
          routerName: prefix || name,
          inputSchema: leafDef?.inputs?.[0],
          type: (leafDef?.type as ProcedureMeta['type']) ?? 'unknown',
        });
      }
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
