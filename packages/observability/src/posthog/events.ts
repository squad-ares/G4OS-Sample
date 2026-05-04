/**
 * Catálogo tipado de eventos PostHog. String literal de evento não passa
 * o type check — só os definidos aqui podem ser emitidos. Centraliza:
 *
 * 1. **O que sai do app** — qualquer reviewer abre este arquivo e vê
 *    todos os events possíveis em diff.
 * 2. **Shape de properties** — cada event tem props tipadas; campo a mais
 *    quebra compilation.
 * 3. **PII gate** — properties não aceita `userId`, `email`, `name`,
 *    `path` cru. Se precisar dimensão "quem", use `distinctId` (UUID
 *    anônimo); se precisar "qual feature", use slug discreto.
 *
 * Adicionar evento novo:
 * 1. Adicionar key + props shape em `EventMap` abaixo.
 * 2. Documentar o WHY no JSDoc (qual decisão de produto esse evento
 *    informa).
 * 3. Atualizar privacy policy se a property for sensível.
 */

export interface EventMap {
  /** Boot do app — separa cold start (sem cache) de warm start. */
  'app.boot': {
    readonly cold: boolean;
    readonly bootMs: number;
  };

  /** User completou o onboarding (primeira workspace + primeiro turn). */
  'onboarding.completed': {
    readonly stepCount: number;
    readonly elapsedSec: number;
  };

  /** Turn enviado — informa engagement diário e padrões de uso. */
  'turn.sent': {
    readonly provider: string;
    readonly hasAttachments: boolean;
    readonly hasMentions: boolean;
  };

  /** Source ativada — quais conectores são usados. */
  'source.activated': {
    readonly slug: string;
    readonly kind: 'managed' | 'mcp-stdio' | 'mcp-http' | 'api' | 'filesystem';
  };

  /** Migração V1→V2 executada — sucesso/falha de wave de upgrade. */
  'migration.executed': {
    readonly steps: readonly string[];
    readonly itemsMigrated: number;
    readonly itemsSkipped: number;
    readonly hadFailures: boolean;
  };

  /** Settings alterado — quais categorias o user toca. */
  'settings.changed': {
    readonly category: string;
    readonly key: string;
  };
}

export type EventName = keyof EventMap;

/**
 * Helper tipado pra capture sem string literal solta. Falha em compile
 * se `event` não está em `EventMap` ou se `properties` não bate.
 */
export interface TypedPostHogClient {
  capture<E extends EventName>(event: E, properties: EventMap[E]): void;
}

export function makeTypedClient(handle: {
  capture(event: string, properties?: Record<string, unknown>): void;
}): TypedPostHogClient {
  return {
    capture: (event, properties) => {
      handle.capture(event, properties as Record<string, unknown>);
    },
  };
}
