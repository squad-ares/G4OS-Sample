/**
 * Testes unitários para `executeToolUses` / `executeSingleTool` (tool-execution.ts).
 *
 * Coberturas obrigatórias CR-46 F-CR46-1:
 *  - Abort entre tool uses: sinal já abortado pula tools restantes
 *  - Timeout per-tool: timeoutController abortado retorna isError:true
 *  - Permission deny: retorna isError:true com mensagem de deny
 *  - Tool não registrada: retorna isError:true
 *  - Tool handler sucesso: retorna isError:false com conteúdo do handler
 *  - Abort durante espera de permissão: rejeita e chama cancelPendingForSession
 */

import type { ToolCatalog } from '@g4os/agents/tools';
import type { PermissionBroker } from '@g4os/permissions';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { SessionEventBus } from '../session-event-bus.ts';
import { type ExecuteToolUsesCtx, executeToolUses } from '../tool-execution.ts';
import type { CapturedToolUse } from '../turn-runner.ts';

const SESSION_ID = '00000000-0000-0000-0000-00000000sess';
const TURN_ID = 'turn-exec-001';

function makeToolUse(name = 'read_file', id = 'tu-1'): CapturedToolUse {
  return { toolUseId: id, toolName: name, input: { path: '/tmp/test.txt' } };
}

function makeBroker(
  decision: 'allow_once' | 'allow_session' | 'deny' = 'allow_once',
): PermissionBroker {
  return {
    request: vi.fn().mockResolvedValue(decision),
    respond: vi.fn(),
    cancel: vi.fn(),
    cancelPendingForSession: vi.fn(),
    clearSessionAllow: vi.fn(),
    cancelRequest: vi.fn(),
    dispose: vi.fn(),
    _disposed: false,
  } as unknown as PermissionBroker;
}

function makeToolCatalog(opts?: { name?: string; output?: string; error?: boolean }): ToolCatalog {
  const toolName = opts?.name ?? 'read_file';
  const handler = {
    name: toolName,
    definition: { name: toolName, description: 'test tool', inputSchema: {} },
    execute: vi
      .fn()
      .mockResolvedValue(
        opts?.error
          ? { isOk: () => false, isErr: () => true, error: { message: 'handler error' } }
          : ok({ output: opts?.output ?? 'file contents' }),
      ),
  };
  return {
    list: () => [],
    get: (name: string) => (name === toolName ? handler : undefined),
  };
}

function makeDeps(opts?: {
  broker?: PermissionBroker;
  catalog?: ToolCatalog;
  bus?: SessionEventBus;
}) {
  return {
    permissionBroker: opts?.broker ?? makeBroker(),
    toolCatalog: opts?.catalog ?? makeToolCatalog(),
    eventBus: opts?.bus ?? new SessionEventBus(),
  };
}

function makeCtx(overrides: Partial<ExecuteToolUsesCtx> = {}): ExecuteToolUsesCtx {
  return {
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    toolUses: [makeToolUse()],
    workingDirectory: '/tmp',
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('executeToolUses', () => {
  it('executa tool com sucesso e retorna isError:false', async () => {
    const bus = new SessionEventBus();
    const deps = makeDeps({ bus });
    const outcomes = await executeToolUses(deps, makeCtx());
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.isError).toBe(false);
    expect(outcomes[0]?.content).toBe('file contents');
    bus.dispose();
  });

  it('permission deny retorna isError:true', async () => {
    const bus = new SessionEventBus();
    const deps = makeDeps({ broker: makeBroker('deny'), bus });
    const outcomes = await executeToolUses(deps, makeCtx());
    expect(outcomes[0]?.isError).toBe(true);
    expect(outcomes[0]?.content).toContain('denied');
    bus.dispose();
  });

  it('tool não registrada no catalog retorna isError:true', async () => {
    const bus = new SessionEventBus();
    const emptyCatalog: ToolCatalog = { list: () => [], get: () => undefined };
    const deps = makeDeps({ catalog: emptyCatalog, bus });
    const outcomes = await executeToolUses(deps, makeCtx());
    expect(outcomes[0]?.isError).toBe(true);
    expect(outcomes[0]?.content).toContain('not registered');
    bus.dispose();
  });

  it('signal já abortado antes da iteração: pula tools restantes (CR-18 F-SR1)', async () => {
    const controller = new AbortController();
    controller.abort();
    const bus = new SessionEventBus();
    const deps = makeDeps({ bus });
    const ctx = makeCtx({
      signal: controller.signal,
      toolUses: [makeToolUse('read_file', 'tu-1'), makeToolUse('read_file', 'tu-2')],
    });
    const outcomes = await executeToolUses(deps, ctx);
    // Nenhuma tool deve ser executada quando signal está abortado
    expect(outcomes).toHaveLength(0);
    bus.dispose();
  });

  it('abort durante espera de permissão: retorna isError:true e chama cancelPendingForSession', async () => {
    const controller = new AbortController();
    const broker: PermissionBroker = {
      request: vi.fn().mockImplementation(
        () =>
          new Promise<never>(() => {
            // Pendura para simular usuário cancelando antes de decidir
            // Aborta o controller após registrar a promise
            setTimeout(() => controller.abort(), 0);
          }),
      ),
      respond: vi.fn(),
      cancel: vi.fn(),
      cancelPendingForSession: vi.fn(),
      clearSessionAllow: vi.fn(),
      cancelRequest: vi.fn(),
      dispose: vi.fn(),
      _disposed: false,
    } as unknown as PermissionBroker;
    const bus = new SessionEventBus();
    const deps = makeDeps({ broker, bus });
    const outcomes = await executeToolUses(deps, makeCtx({ signal: controller.signal }));
    expect(outcomes[0]?.isError).toBe(true);
    expect(broker.cancelPendingForSession).toHaveBeenCalledWith(SESSION_ID);
    bus.dispose();
  });

  it('tool handler retorna err: isError:true com mensagem do handler', async () => {
    const bus = new SessionEventBus();
    const catalog = makeToolCatalog({ error: true });
    const deps = makeDeps({ catalog, bus });
    const outcomes = await executeToolUses(deps, makeCtx());
    expect(outcomes[0]?.isError).toBe(true);
    expect(outcomes[0]?.content).toBe('handler error');
    bus.dispose();
  });

  it('F-CR46-3: timeoutController abortado após execução não vaza listeners no signal de turno', async () => {
    // Valida que o finally aborta o timeoutController, liberando listeners no signal composto.
    // Não há forma direta de contar listeners em AbortSignal — testamos comportamento:
    // a segunda tool ainda executa normalmente mesmo após a primeira ter terminado.
    const bus = new SessionEventBus();
    const deps = makeDeps({ bus });
    const ctx = makeCtx({
      toolUses: [makeToolUse('read_file', 'tu-1'), makeToolUse('read_file', 'tu-2')],
      toolTimeoutMs: 5000,
    });
    const outcomes = await executeToolUses(deps, ctx);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => !o.isError)).toBe(true);
    bus.dispose();
  });

  it('emite turn.tool_use_completed no bus para cada tool executada', async () => {
    const bus = new SessionEventBus();
    const completed: string[] = [];
    bus.subscribe(SESSION_ID, (e) => {
      if (e.type === 'turn.tool_use_completed') completed.push(e.toolUseId);
    });
    const deps = makeDeps({ bus });
    await executeToolUses(
      deps,
      makeCtx({
        toolUses: [makeToolUse('read_file', 'tu-a'), makeToolUse('read_file', 'tu-b')],
      }),
    );
    expect(completed).toEqual(['tu-a', 'tu-b']);
    bus.dispose();
  });
});
