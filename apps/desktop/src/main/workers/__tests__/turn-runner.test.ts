import { type AgentEvent, AgentRegistry, type IAgent } from '@g4os/agents/interface';
import type { AgentError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainToWorkerDispatch, WorkerToMain } from '../protocol.ts';
import { WorkerTurnRunner } from '../turn-runner.ts';

/**
 * Mini Observable stub suficiente para o contrato usado pelo TurnRunner:
 *   `.subscribe({ next, error, complete })` com `unsubscribe()` retornado.
 * Evita depender de `rxjs` diretamente no test runner do desktop app.
 */
interface MiniObserver<T> {
  readonly next: (v: T) => void;
  readonly error?: (e: unknown) => void;
  readonly complete?: () => void;
}

class MiniSubject<T> {
  #observers: Array<MiniObserver<T>> = [];

  subscribe(o: MiniObserver<T>): { unsubscribe(): void } {
    this.#observers.push(o);
    return {
      unsubscribe: () => {
        this.#observers = this.#observers.filter((x) => x !== o);
      },
    };
  }

  next(v: T): void {
    for (const o of [...this.#observers]) o.next(v);
  }

  complete(): void {
    for (const o of [...this.#observers]) o.complete?.();
    this.#observers = [];
  }

  error(e: unknown): void {
    for (const o of [...this.#observers]) o.error?.(e);
    this.#observers = [];
  }
}

interface FakeAgent extends IAgent {
  readonly events$: MiniSubject<AgentEvent>;
  readonly interruptSpy: ReturnType<typeof vi.fn>;
  readonly disposeSpy: ReturnType<typeof vi.fn>;
}

function makeAgent(): FakeAgent {
  const subject = new MiniSubject<AgentEvent>();
  const interruptSpy = vi.fn(
    (): Promise<Result<void, AgentError>> => Promise.resolve(ok(undefined)),
  );
  const disposeSpy = vi.fn();
  const agent: IAgent = {
    kind: 'fake',
    capabilities: {
      family: 'anthropic',
      streaming: true,
      thinking: false,
      toolUse: false,
      promptCaching: false,
      maxContextTokens: 8_000,
      supportedTools: 'all',
    },
    run: () => subject as unknown as ReturnType<IAgent['run']>,
    interrupt: interruptSpy,
    dispose: disposeSpy,
  };
  return Object.assign(agent, { events$: subject, interruptSpy, disposeSpy }) as FakeAgent;
}

function registryWithAgent(agent: IAgent): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register({
    kind: 'fake',
    supports: () => true,
    create: () => agent,
  });
  return registry;
}

function baseDispatch(): MainToWorkerDispatch {
  return {
    type: 'dispatch',
    sessionId: 'sess-1',
    turnId: 'turn-1',
    messages: [],
    config: { connectionSlug: 'anthropic-direct', modelId: 'claude-sonnet-4-6' },
    credentials: { anthropicApiKey: 'sk-test' },
  };
}

describe('WorkerTurnRunner', () => {
  let posted: WorkerToMain[];
  let agent: FakeAgent;
  let runner: WorkerTurnRunner;

  beforeEach(() => {
    posted = [];
    agent = makeAgent();
    runner = new WorkerTurnRunner({
      registry: new AgentRegistry(),
      post: (msg) => posted.push(msg),
      buildRegistry: () => registryWithAgent(agent),
    });
  });

  it('emite turn.started e texto depois de dispatch', async () => {
    const promise = runner.dispatch(baseDispatch());
    await Promise.resolve();

    agent.events$.next({ type: 'text_delta', text: 'oi' });
    agent.events$.next({ type: 'done', reason: 'stop' });
    agent.events$.complete();

    await promise;

    const streams = posted.filter((m) => m.type === 'turn-stream');
    const started = streams.some((m) => (m.event as { type: string }).type === 'turn.started');
    const textChunk = streams.some((m) => (m.event as { type: string }).type === 'turn.text_chunk');
    const done = streams.some((m) => (m.event as { type: string }).type === 'turn.done');
    expect(started).toBe(true);
    expect(textChunk).toBe(true);
    expect(done).toBe(true);

    const complete = posted.find((m) => m.type === 'turn-complete');
    expect(complete).toBeDefined();
    if (complete && complete.type === 'turn-complete') {
      expect(complete.text).toBe('oi');
      expect(complete.reason).toBe('stop');
    }
  });

  it('acumula texto e thinking ao longo de múltiplos deltas', async () => {
    const promise = runner.dispatch(baseDispatch());
    await Promise.resolve();

    agent.events$.next({ type: 'thinking_delta', text: 'hmm' });
    agent.events$.next({ type: 'text_delta', text: 'olá' });
    agent.events$.next({ type: 'text_delta', text: ' mundo' });
    agent.events$.next({ type: 'usage', input: 10, output: 20 });
    agent.events$.next({ type: 'done', reason: 'stop' });
    agent.events$.complete();

    await promise;

    const complete = posted.find((m) => m.type === 'turn-complete');
    expect(complete).toBeDefined();
    if (complete && complete.type === 'turn-complete') {
      expect(complete.text).toBe('olá mundo');
      expect(complete.thinking).toBe('hmm');
      expect(complete.usage).toEqual({ input: 10, output: 20 });
    }
  });

  it('rejeita dispatch concorrente com worker.turn_in_progress', async () => {
    const first = runner.dispatch(baseDispatch());
    await Promise.resolve();

    await runner.dispatch({ ...baseDispatch(), turnId: 'turn-2' });

    const errs = posted.filter((m) => m.type === 'error');
    expect(errs.length).toBe(1);
    if (errs[0] && errs[0].type === 'error') {
      expect(errs[0].code).toBe('worker.turn_in_progress');
      expect(errs[0].turnId).toBe('turn-2');
    }

    agent.events$.next({ type: 'done', reason: 'stop' });
    agent.events$.complete();
    await first;
  });

  it('interrupt passa sessionId (não turnId) para agent.interrupt', async () => {
    const promise = runner.dispatch(baseDispatch());
    await Promise.resolve();

    runner.interrupt();

    expect(agent.interruptSpy).toHaveBeenCalledWith('sess-1');
    agent.events$.complete();
    await promise;
  });

  it('interrupt com turnId diferente do ativo é no-op', async () => {
    const promise = runner.dispatch(baseDispatch());
    await Promise.resolve();

    runner.interrupt('turn-outra');

    expect(agent.interruptSpy).not.toHaveBeenCalled();

    agent.events$.next({ type: 'done', reason: 'stop' });
    agent.events$.complete();
    await promise;
  });

  it('emite erro quando registry não tem factory', async () => {
    const runnerSemFactory = new WorkerTurnRunner({
      registry: new AgentRegistry(),
      post: (msg) => posted.push(msg),
      buildRegistry: () => new AgentRegistry(),
    });

    await runnerSemFactory.dispatch(baseDispatch());

    const errs = posted.filter((m) => m.type === 'error');
    expect(errs.length).toBe(1);
  });
});
