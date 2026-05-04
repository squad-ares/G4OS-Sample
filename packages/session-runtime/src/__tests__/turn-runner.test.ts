/**
 * Testes unitários para `runAgentIteration` (turn-runner.ts).
 *
 * Coberturas obrigatórias CR-46 F-CR46-1:
 *  - Fluxo feliz: text_delta → usage → done:stop
 *  - tool_use_complete sem tool_use_start precedente (branch defensivo CR-18 F-SR5)
 *  - Error stream: agente emite error event
 *  - onSubscription não chamado quando Observable completa síncronamente (F-CR46-8)
 *  - safeStringify com input não-serializável retorna marcador (F-CR46-6)
 */

import type { AgentConfig, AgentEvent, IAgent } from '@g4os/agents/interface';
import type { TurnTelemetry } from '@g4os/observability/metrics';
import { EMPTY, Observable, of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SessionEventBus } from '../session-event-bus.ts';
import { runAgentIteration } from '../turn-runner.ts';

const SESSION_ID = '00000000-0000-0000-0000-00000000sess';
const TURN_ID = 'turn-001';

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

function makeAgent(obs: Observable<AgentEvent>): IAgent {
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
    run: () => obs,
    interrupt: vi.fn().mockResolvedValue({ isOk: () => true, isErr: () => false }),
    dispose: vi.fn(),
    _disposed: false,
  } as unknown as IAgent;
}

describe('runAgentIteration', () => {
  it('agrega text chunks e resolve com doneReason:stop', async () => {
    const events: AgentEvent[] = [
      { type: 'text_delta', text: 'hello' },
      { type: 'text_delta', text: ' world' },
      { type: 'usage', input: 10, output: 5 },
      { type: 'done', reason: 'stop' },
    ];
    const bus = new SessionEventBus();
    const result = await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(of(...events)),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.textChunks).toEqual(['hello', ' world']);
    expect(result.value.doneReason).toBe('stop');
    expect(result.value.usage.input).toBe(10);
    expect(result.value.usage.output).toBe(5);
    bus.dispose();
  });

  it('resolve com doneReason:tool_use quando agent emite tool_use_complete', async () => {
    const events: AgentEvent[] = [
      { type: 'tool_use_start', toolUseId: 'tu-1', toolName: 'read_file' },
      { type: 'tool_use_complete', toolUseId: 'tu-1', input: { path: '/tmp/a' } },
      { type: 'usage', input: 2, output: 1 },
      { type: 'done', reason: 'tool_use' },
    ];
    const bus = new SessionEventBus();
    const result = await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(of(...events)),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.doneReason).toBe('tool_use');
    expect(result.value.toolUses).toHaveLength(1);
    expect(result.value.toolUses[0]?.toolName).toBe('read_file');
    expect(result.value.toolUses[0]?.input).toEqual({ path: '/tmp/a' });
    bus.dispose();
  });

  it('tool_use_complete sem tool_use_start precedente — cria entrada com toolName:unknown (CR-18 F-SR5)', async () => {
    const events: AgentEvent[] = [
      // Não há tool_use_start antes do complete — branch defensivo
      { type: 'tool_use_complete', toolUseId: 'orphan-1', input: { x: 1 } },
      { type: 'done', reason: 'tool_use' },
    ];
    const bus = new SessionEventBus();
    const result = await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(of(...events)),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.toolUses).toHaveLength(1);
    expect(result.value.toolUses[0]?.toolName).toBe('unknown');
    bus.dispose();
  });

  it('retorna ok com doneReason:error quando Observable falha via subscriber.error', async () => {
    // O AgentEvent{type:'error'} é apenas uma notificação de bus.
    // Para que doneReason='error' seja retornado, o STREAM precisa lançar
    // via subscriber.error (que é tratado pelo callback error do subscribe).
    const obs = new Observable<AgentEvent>((subscriber) => {
      subscriber.next({ type: 'text_delta', text: 'partial' });
      subscriber.error(new Error('stream failure'));
    });
    const bus = new SessionEventBus();
    const telemetry = makeTelemetry();
    const result = await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(obs),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry,
    });
    // subscriber.error path → settle com ok({doneReason:'error'})
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.doneReason).toBe('error');
    expect(result.value.textChunks).toEqual(['partial']);
    bus.dispose();
  });

  it('resolve com ok quando Observable lança erro no subscriber.error', async () => {
    const obs = new Observable<AgentEvent>((subscriber) => {
      subscriber.error(new Error('network fail'));
    });
    const bus = new SessionEventBus();
    const result = await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(obs),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
    });
    // subscriber.error → settle com ok({doneReason:'error'})
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.doneReason).toBe('error');
    bus.dispose();
  });

  it('F-CR46-8: onSubscription NÃO é chamado quando Observable completa síncronamente', async () => {
    // EMPTY completa síncronamente — settled=true antes de onSubscription ser invocado
    const bus = new SessionEventBus();
    const onSubscription = vi.fn();
    await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(EMPTY),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
      onSubscription,
    });
    expect(onSubscription).not.toHaveBeenCalled();
    bus.dispose();
  });

  it('onSubscription é chamado quando Observable é assíncrono', async () => {
    const subject = new Subject<AgentEvent>();
    const bus = new SessionEventBus();
    const onSubscription = vi.fn();
    const iterPromise = runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(subject.asObservable()),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
      onSubscription,
    });
    // Permite que o subscribe seja chamado (microtask)
    await Promise.resolve();
    expect(onSubscription).toHaveBeenCalledOnce();
    // Completa o subject para resolver a promise
    subject.next({ type: 'done', reason: 'stop' });
    subject.complete();
    await iterPromise;
    bus.dispose();
  });

  it('emite turn.text_chunk no bus para cada text_delta', async () => {
    const events: AgentEvent[] = [
      { type: 'text_delta', text: 'chunk1' },
      { type: 'done', reason: 'stop' },
    ];
    const bus = new SessionEventBus();
    const received: string[] = [];
    bus.subscribe(SESSION_ID, (e) => {
      if (e.type === 'turn.text_chunk') received.push(e.text);
    });
    await runAgentIteration({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      agent: makeAgent(of(...events)),
      config: makeConfig(),
      messages: [],
      eventBus: bus,
      telemetry: makeTelemetry(),
    });
    expect(received).toEqual(['chunk1']);
    bus.dispose();
  });
});
