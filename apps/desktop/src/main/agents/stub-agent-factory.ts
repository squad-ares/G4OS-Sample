/**
 * Stub agent factory — usado APENAS quando `G4OS_E2E=1` está setado no
 * ambiente do processo main. Permite smokes autenticados rodarem offline,
 * sem tocar Anthropic/OpenAI/Google reais. NUNCA deve ser registrado em
 * produção — o bootstrap (`main/index.ts`) faz a guarda.
 *
 * Emite uma sequência mínima de `AgentEvent`:
 *   1. `started`
 *   2. `text_delta` com o echo do último user message ("[stub] <user text>")
 *   3. `usage` (mock contagens)
 *   4. `done` reason=stop
 *
 * Não implementa tool use, thinking, nem streaming chunkado — é o menor
 * surface que renderiza como reply válida no `TurnDispatcher` / renderer.
 */

import type {
  AgentCapabilities,
  AgentConfig,
  AgentEvent,
  AgentFactory,
  AgentTurnInput,
  IAgent,
} from '@g4os/agents/interface';
import type { AgentError } from '@g4os/kernel/errors';
import type { Message, SessionId } from '@g4os/kernel/types';
import { ok, type Result } from 'neverthrow';
import { Observable, type Subscriber } from 'rxjs';

const CAPABILITIES: AgentCapabilities = {
  family: 'anthropic',
  streaming: true,
  thinking: false,
  toolUse: false,
  promptCaching: false,
  maxContextTokens: 200_000,
  supportedTools: [],
};

class StubAgent implements IAgent {
  readonly kind = 'stub-echo';
  readonly capabilities = CAPABILITIES;

  run(input: AgentTurnInput): Observable<AgentEvent> {
    const last = findLastUserText(input.messages);
    const reply = last ? `[stub] ${last}` : '[stub] hello';
    return new Observable<AgentEvent>((subscriber: Subscriber<AgentEvent>) => {
      subscriber.next({ type: 'started', turnId: input.turnId });
      subscriber.next({ type: 'text_delta', text: reply });
      subscriber.next({ type: 'usage', input: reply.length, output: reply.length });
      subscriber.next({ type: 'done', reason: 'stop' });
      subscriber.complete();
      return () => {
        // sem teardown — stub é stateless e a Observable é síncrona
      };
    });
  }

  interrupt(_sessionId: SessionId): Promise<Result<void, AgentError>> {
    return Promise.resolve(ok(undefined));
  }

  dispose(): void {
    // no-op
  }
}

function findLastUserText(messages: readonly Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    for (const block of msg.content) {
      if (block.type === 'text') return block.text;
    }
  }
  return null;
}

export function createStubAgentFactory(): AgentFactory {
  return {
    kind: 'stub-echo',
    supports: (_config: AgentConfig) => true,
    create: (_config: AgentConfig) => new StubAgent(),
  };
}
