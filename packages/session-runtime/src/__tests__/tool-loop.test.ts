/**
 * Testes unitários para `runToolLoop` (tool-loop.ts).
 *
 * Coberturas obrigatórias CR-46 F-CR46-1:
 *  - MAX_ITERATIONS boundary: após 10 iters de tool_use, retorna err
 *  - Abort entre iterations: signal.aborted antes de nova iter retorna err abortado
 *  - Fluxo stop simples: agente retorna stop na primeira iteração
 *  - Fluxo tool_use completo: persist + re-run + stop
 *  - Erro do agent: doneReason=error propaga como err
 */

import type { AgentConfig, AgentEvent, IAgent } from '@g4os/agents/interface';
import type { ToolCatalog } from '@g4os/agents/tools';
import type { Message, MessageAppendResult } from '@g4os/kernel/types';
import type { TurnTelemetry } from '@g4os/observability/metrics';
import type { PermissionBroker } from '@g4os/permissions';
import { ok } from 'neverthrow';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionEventBus } from '../session-event-bus.ts';
import type { ToolLoopDeps, ToolLoopInput } from '../tool-loop.ts';
import { runToolLoop } from '../tool-loop.ts';

const SESSION_ID = '00000000-0000-0000-0000-00000000sess';
const TURN_ID = 'turn-loop-001';

function makeMessage(id = 'msg-1'): Message {
  return {
    id,
    sessionId: SESSION_ID,
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    metadata: {},
  } as unknown as Message;
}

function makeAppendResult(id = 'msg-1'): MessageAppendResult {
  return { message: makeMessage(id), sequenceNumber: 1 };
}

function makeAgent(events: AgentEvent[]): IAgent {
  return {
    kind: 'test',
    capabilities: {
      family: 'anthropic',
      streaming: true,
      thinking: false,
      toolUse: true,
      promptCaching: false,
      maxContextTokens: 8096,
      supportedTools: 'all',
    },
    run: () => of(...events),
    interrupt: vi.fn().mockResolvedValue(ok(undefined)),
    dispose: vi.fn(),
    _disposed: false,
  } as unknown as IAgent;
}

/** Agente que alterna tool_use → stop para simular loop. */
function makeToolUseAgent(toolUseName = 'read_file'): IAgent {
  let callCount = 0;
  return {
    kind: 'test',
    capabilities: {
      family: 'anthropic',
      streaming: true,
      thinking: false,
      toolUse: true,
      promptCaching: false,
      maxContextTokens: 8096,
      supportedTools: 'all',
    },
    run: () => {
      callCount += 1;
      if (callCount === 1) {
        // Primeira chamada: retorna tool_use
        const events: AgentEvent[] = [
          { type: 'tool_use_start', toolUseId: `tu-${callCount}`, toolName: toolUseName },
          { type: 'tool_use_complete', toolUseId: `tu-${callCount}`, input: { path: '/tmp/a' } },
          { type: 'usage', input: 5, output: 3 },
          { type: 'done', reason: 'tool_use' },
        ];
        return of(...events);
      }
      // Segunda chamada: retorna stop
      const events: AgentEvent[] = [
        { type: 'text_delta', text: 'done' },
        { type: 'usage', input: 2, output: 1 },
        { type: 'done', reason: 'stop' },
      ];
      return of(...events);
    },
    interrupt: vi.fn().mockResolvedValue(ok(undefined)),
    dispose: vi.fn(),
    _disposed: false,
  } as unknown as IAgent;
}

/** Agente que sempre retorna tool_use para testar MAX_ITERATIONS. */
function makeInfiniteToolUseAgent(): IAgent {
  let callCount = 0;
  return {
    kind: 'test',
    capabilities: {
      family: 'anthropic',
      streaming: true,
      thinking: false,
      toolUse: true,
      promptCaching: false,
      maxContextTokens: 8096,
      supportedTools: 'all',
    },
    run: () => {
      callCount += 1;
      const events: AgentEvent[] = [
        { type: 'tool_use_start', toolUseId: `tu-${callCount}`, toolName: 'read_file' },
        {
          type: 'tool_use_complete',
          toolUseId: `tu-${callCount}`,
          input: { path: `/tmp/${callCount}` },
        },
        { type: 'usage', input: 1, output: 1 },
        { type: 'done', reason: 'tool_use' },
      ];
      return of(...events);
    },
    interrupt: vi.fn().mockResolvedValue(ok(undefined)),
    dispose: vi.fn(),
    _disposed: false,
  } as unknown as IAgent;
}

function makeBroker(decision: 'allow_once' | 'deny' = 'allow_once'): PermissionBroker {
  return {
    request: vi.fn().mockResolvedValue(decision),
    respond: vi.fn(),
    cancel: vi.fn(),
    cancelPendingForSession: vi.fn(),
    clearSessionAllow: vi.fn(),
    cancelRequest: vi.fn(),
    dispose: vi.fn(),
  } as unknown as PermissionBroker;
}

function makeToolCatalog(handlerResult?: string): ToolCatalog {
  const handler = {
    name: 'read_file',
    definition: { name: 'read_file', description: 'reads a file', inputSchema: {} },
    execute: vi.fn().mockResolvedValue(ok({ output: handlerResult ?? 'file content' })),
  };
  return {
    list: () => [],
    get: (name: string) => (name === 'read_file' ? handler : undefined),
  };
}

function makeMessages(): Pick<import('@g4os/ipc/server').MessagesService, 'append' | 'list'> {
  return {
    append: vi.fn().mockResolvedValue(ok(makeAppendResult())),
    list: vi.fn().mockResolvedValue(ok([])),
  };
}

function makeDeps(overrides: Partial<ToolLoopDeps> = {}): ToolLoopDeps {
  return {
    messages: makeMessages() as never,
    eventBus: new SessionEventBus(),
    permissionBroker: makeBroker(),
    toolCatalog: makeToolCatalog(),
    ...overrides,
  };
}

function makeConfig(): AgentConfig {
  return { connectionSlug: 'anthropic-direct', modelId: 'claude-test' };
}

function makeTelemetry(): TurnTelemetry {
  return {
    onStart: vi.fn(),
    onUsage: vi.fn(),
    onToolCall: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

function makeInput(agent: IAgent, overrides: Partial<ToolLoopInput> = {}): ToolLoopInput {
  return {
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    agent,
    initialMessages: [],
    config: makeConfig(),
    workingDirectory: '/tmp',
    telemetry: makeTelemetry(),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('runToolLoop', () => {
  it('retorna ok quando agente retorna stop na primeira iteração', async () => {
    const events: AgentEvent[] = [
      { type: 'text_delta', text: 'hello' },
      { type: 'usage', input: 5, output: 3 },
      { type: 'done', reason: 'stop' },
    ];
    const deps = makeDeps();
    const result = await runToolLoop(deps, makeInput(makeAgent(events)));
    expect(result.isOk()).toBe(true);
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('MAX_ITERATIONS boundary: retorna err após 10 iterações de tool_use', async () => {
    // Agente sempre retorna tool_use — força esgotar o limite
    const agent = makeInfiniteToolUseAgent();
    const messages = makeMessages();
    const deps = makeDeps({ messages: messages as never });
    const result = await runToolLoop(deps, makeInput(agent));
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    // AGENT_UNAVAILABLE com mensagem de max iterations
    expect(result.error.message).toContain('max iterations');
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('abort antes da primeira iteração retorna err com context.aborted:true', async () => {
    const controller = new AbortController();
    controller.abort();
    const events: AgentEvent[] = [{ type: 'done', reason: 'stop' }];
    const deps = makeDeps();
    const result = await runToolLoop(
      deps,
      makeInput(makeAgent(events), { signal: controller.signal }),
    );
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.context['aborted']).toBe(true);
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('fluxo tool_use completo: agent → tool_use → persist → re-run → stop → ok', async () => {
    const agent = makeToolUseAgent();
    const messages = makeMessages();
    const deps = makeDeps({ messages: messages as never });
    const result = await runToolLoop(deps, makeInput(agent));
    expect(result.isOk()).toBe(true);
    // Deve ter chamado append ao menos 2 vezes (assistant tool_use + role:tool)
    const appendFn = messages.append as ReturnType<typeof vi.fn>;
    expect(appendFn).toHaveBeenCalledTimes(3); // assistant+tool_use, role=tool, assistant final
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('permission deny: tool retorna isError:true para o agent mas loop continua', async () => {
    const events: AgentEvent[] = [
      { type: 'tool_use_start', toolUseId: 'tu-deny', toolName: 'read_file' },
      { type: 'tool_use_complete', toolUseId: 'tu-deny', input: { path: '/secret' } },
      { type: 'usage', input: 3, output: 2 },
      { type: 'done', reason: 'tool_use' },
    ];
    const denyBroker = makeBroker('deny');
    const messages = makeMessages();
    const deps = makeDeps({ permissionBroker: denyBroker, messages: messages as never });

    // Segundo turno do agent: retorna stop
    let callCount = 0;
    const agent: IAgent = {
      kind: 'test',
      capabilities: {
        family: 'anthropic',
        streaming: true,
        thinking: false,
        toolUse: true,
        promptCaching: false,
        maxContextTokens: 8096,
        supportedTools: 'all',
      },
      run: () => {
        callCount += 1;
        if (callCount === 1) return of(...events);
        return of<AgentEvent>(
          { type: 'text_delta', text: 'acknowledged' },
          { type: 'usage', input: 1, output: 1 },
          { type: 'done', reason: 'stop' },
        );
      },
      interrupt: vi.fn().mockResolvedValue(ok(undefined)),
      dispose: vi.fn(),
      _disposed: false,
    } as unknown as IAgent;

    const result = await runToolLoop(deps, makeInput(agent));
    expect(result.isOk()).toBe(true);
    // O broker foi chamado uma vez para a tool deny
    expect(denyBroker.request).toHaveBeenCalledOnce();
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('tool não registrada no catalog: retorna isError:true, loop continua', async () => {
    const events: AgentEvent[] = [
      { type: 'tool_use_start', toolUseId: 'tu-1', toolName: 'unknown_tool' },
      { type: 'tool_use_complete', toolUseId: 'tu-1', input: {} },
      { type: 'usage', input: 1, output: 1 },
      { type: 'done', reason: 'tool_use' },
    ];
    const messages = makeMessages();
    const emptyCatalog: ToolCatalog = { list: () => [], get: () => undefined };
    const deps = makeDeps({ messages: messages as never, toolCatalog: emptyCatalog });

    let callCount = 0;
    const agent: IAgent = {
      kind: 'test',
      capabilities: {
        family: 'anthropic',
        streaming: true,
        thinking: false,
        toolUse: true,
        promptCaching: false,
        maxContextTokens: 8096,
        supportedTools: 'all',
      },
      run: () => {
        callCount += 1;
        if (callCount === 1) return of(...events);
        return of<AgentEvent>({ type: 'done', reason: 'stop' });
      },
      interrupt: vi.fn().mockResolvedValue(ok(undefined)),
      dispose: vi.fn(),
      _disposed: false,
    } as unknown as IAgent;

    const result = await runToolLoop(deps, makeInput(agent));
    expect(result.isOk()).toBe(true);
    (deps.eventBus as SessionEventBus).dispose();
  });

  it('doneReason:error flushed como erro após persistir texto parcial', async () => {
    // O doneReason='error' é acionado via subscriber.error (stream error),
    // não via AgentEvent{type:'error'} (que é apenas uma notificação de bus).
    const messages = makeMessages();
    const deps = makeDeps({ messages: messages as never });

    const errorAgent: IAgent = {
      kind: 'test',
      capabilities: {
        family: 'anthropic',
        streaming: true,
        thinking: false,
        toolUse: true,
        promptCaching: false,
        maxContextTokens: 8096,
        supportedTools: 'all',
      },
      run: () =>
        new Observable<AgentEvent>((subscriber) => {
          subscriber.next({ type: 'text_delta', text: 'parcial' });
          // subscriber.error → doneReason='error' no turn-runner
          subscriber.error(new Error('stream fail'));
        }),
      interrupt: vi.fn().mockResolvedValue(ok(undefined)),
      dispose: vi.fn(),
      _disposed: false,
    } as unknown as IAgent;

    const result = await runToolLoop(deps, makeInput(errorAgent));
    expect(result.isErr()).toBe(true);
    // Texto parcial deve ter sido persistido (append chamado) via finalizeAssistantMessage
    const appendFn = messages.append as ReturnType<typeof vi.fn>;
    expect(appendFn).toHaveBeenCalled();
    (deps.eventBus as SessionEventBus).dispose();
  });
});
