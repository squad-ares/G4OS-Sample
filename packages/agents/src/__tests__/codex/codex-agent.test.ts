import { lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppServerClient } from '../../codex/app-server/client.ts';
import type { CodexRequest, CodexResponseEvent } from '../../codex/app-server/protocol.ts';
import type {
  Subprocess,
  SubprocessExit,
  SubprocessSpawner,
} from '../../codex/app-server/subprocess.ts';
import { CodexAgent } from '../../codex/codex-agent.ts';
import type { AgentConfig, AgentEvent, AgentTurnInput } from '../../interface/agent.ts';

class ScriptedSubprocess implements Subprocess {
  readonly writes: string[] = [];
  killed = false;
  private done = false;
  private readonly waiters: Array<(result: IteratorResult<string>) => void> = [];
  private resolveExit!: (value: SubprocessExit) => void;
  readonly exit: Promise<SubprocessExit> = new Promise((resolve) => {
    this.resolveExit = resolve;
  });

  readonly stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => this.nextStdout(),
    }),
  };

  write(chunk: string): Promise<void> {
    this.writes.push(chunk);
    return Promise.resolve();
  }

  kill(): void {
    this.killed = true;
    this.done = true;
    this.resolveExit({ code: null, signal: 'SIGTERM' });
    while (this.waiters.length > 0) {
      const w = this.waiters.shift();
      w?.({ value: undefined as unknown as string, done: true });
    }
  }

  push(chunk: string): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.({ value: chunk, done: false });
      return;
    }
    this.queue.push(chunk);
  }

  lastRequest(): CodexRequest | undefined {
    const last = this.writes[this.writes.length - 1];
    if (!last) return undefined;
    return JSON.parse(last.trim()) as CodexRequest;
  }

  private queue: string[] = [];
  private nextStdout(): Promise<IteratorResult<string>> {
    if (this.queue.length > 0) {
      const value = this.queue.shift() as string;
      return Promise.resolve({ value, done: false });
    }
    if (this.done) return Promise.resolve({ value: undefined as unknown as string, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

class ScriptedSpawner implements SubprocessSpawner {
  readonly kind = 'scripted' as const;
  readonly children: ScriptedSubprocess[] = [];
  spawn(): Subprocess {
    const child = new ScriptedSubprocess();
    this.children.push(child);
    return child;
  }
}

function buildAgent(requestId = 'req-1') {
  const spawner = new ScriptedSpawner();
  const client = new AppServerClient({ command: '/bin/codex', spawner });
  client.start();
  const subprocess = spawner.children[0];
  if (!subprocess) throw new Error('spawn did not run');
  const config: AgentConfig = { connectionSlug: 'openai-codex', modelId: 'gpt-5-codex' };
  const agent = new CodexAgent(config, {
    appServer: client,
    requestIdFactory: () => requestId,
  });
  return { agent, client, subprocess, spawner };
}

function makeInput(): AgentTurnInput {
  return {
    sessionId: '00000000-0000-0000-0000-000000000001',
    turnId: 'turn-1',
    messages: [],
    config: { connectionSlug: 'openai-codex', modelId: 'gpt-5-codex' },
  };
}

function push(subprocess: ScriptedSubprocess, event: CodexResponseEvent): void {
  subprocess.push(`${JSON.stringify(event)}\n`);
}

describe('CodexAgent', () => {
  it('kind is "codex" with openai-compat capabilities', () => {
    const { agent } = buildAgent();
    expect(agent.kind).toBe('codex');
    expect(agent.capabilities.family).toBe('openai-compat');
    expect(agent.capabilities.streaming).toBe(true);
    agent.dispose();
  });

  it('run() sends run_turn and emits mapped events ending in done', async () => {
    const { agent, subprocess } = buildAgent('req-1');
    const collected: AgentEvent[] = [];
    const subscription = agent.run(makeInput()).subscribe({
      next: (ev) => collected.push(ev),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(subprocess.lastRequest()).toMatchObject({ type: 'run_turn', requestId: 'req-1' });

    push(subprocess, { type: 'turn_started', requestId: 'req-1', turnId: 't-1' });
    push(subprocess, { type: 'text_delta', requestId: 'req-1', text: 'hi' });
    push(subprocess, { type: 'turn_finished', requestId: 'req-1', stopReason: 'stop' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    subscription.unsubscribe();
    const types = collected.map((e) => e.type);
    expect(types).toContain('started');
    expect(types).toContain('text_delta');
    expect(types).toContain('done');
    agent.dispose();
  });

  it('ignores events for other requestIds (multi-turn isolation)', async () => {
    const { agent, subprocess } = buildAgent('req-active');
    const collected: AgentEvent[] = [];
    const subscription = agent.run(makeInput()).subscribe({ next: (e) => collected.push(e) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    push(subprocess, { type: 'text_delta', requestId: 'req-other', text: 'stray' });
    push(subprocess, { type: 'text_delta', requestId: 'req-active', text: 'mine' });
    push(subprocess, { type: 'turn_finished', requestId: 'req-active', stopReason: 'stop' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    subscription.unsubscribe();
    const texts = collected
      .filter((e) => e.type === 'text_delta')
      .map((e) => {
        if (e.type === 'text_delta') return e.text;
        return '';
      });
    expect(texts).toEqual(['mine']);
    agent.dispose();
  });

  it('unsubscribe sends cancel for the active requestId', async () => {
    const { agent, subprocess } = buildAgent('req-cancel');
    const subscription = agent.run(makeInput()).subscribe();
    await new Promise((resolve) => setTimeout(resolve, 5));
    subscription.unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cancelSent = subprocess.writes.some((w) => {
      const parsed = JSON.parse(w.trim()) as CodexRequest;
      return parsed.type === 'cancel' && parsed.requestId === 'req-cancel';
    });
    expect(cancelSent).toBe(true);
    agent.dispose();
  });

  it('interrupt(sessionId) sends cancel and returns ok Result', async () => {
    const { agent, subprocess } = buildAgent('req-int');
    const input = makeInput();
    const subscription = agent.run(input).subscribe();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await agent.interrupt(input.sessionId);
    expect(result.isOk()).toBe(true);
    const sentCancel = subprocess.writes
      .map((w) => JSON.parse(w.trim()) as CodexRequest)
      .find((m) => m.type === 'cancel' && m.requestId === 'req-int');
    expect(sentCancel).toBeDefined();
    subscription.unsubscribe();
    agent.dispose();
  });

  it('wire error becomes AgentEvent error + done:error', async () => {
    const { agent, subprocess } = buildAgent('req-err');
    const events = lastValueFrom(agent.run(makeInput()).pipe(toArray()));
    await new Promise((resolve) => setTimeout(resolve, 5));
    push(subprocess, {
      type: 'error',
      requestId: 'req-err',
      code: 'rate_limited',
      message: 'slow down',
    });
    const collected = await events;
    const types = collected.map((e) => e.type);
    expect(types).toContain('error');
    expect(types[types.length - 1]).toBe('done');
    agent.dispose();
  });

  it('dispose() kills subprocess + detaches bridge MCP', () => {
    const { agent, subprocess } = buildAgent();
    const bridgeMcp = { detach: vi.fn(), current: () => undefined };
    // Bridge precisa ser injetada na construção (DisposableBase captura
    // o disposer via `_register` no constructor para garantir ordem
    // determinística de teardown — ADR-0012).
    const spawner = new ScriptedSpawner();
    const client = new AppServerClient({ command: '/bin/codex', spawner });
    client.start();
    const config: AgentConfig = { connectionSlug: 'openai-codex', modelId: 'gpt-5-codex' };
    const agentWithBridge = new CodexAgent(config, {
      appServer: client,
      requestIdFactory: () => 'req-bridge',
      bridgeMcp,
    });
    agentWithBridge.dispose();
    expect(bridgeMcp.detach).toHaveBeenCalled();
    agent.dispose();
    expect(subprocess.killed).toBe(true);
  });
});
