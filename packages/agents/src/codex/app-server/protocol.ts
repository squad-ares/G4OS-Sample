/**
 * Re-exporta types do `@g4os/codex-types` . Pacote externo
 * é o source of truth pra que consumers fora de `@g4os/agents` (testes,
 * bridge MCP, observability) possam importar sem dep transitiva.
 *
 * Manter este arquivo como re-export apenas. Adicionar types novos no
 * `@g4os/codex-types`.
 */

export type {
  CodexCancelRequest,
  CodexRequest,
  CodexResponseEvent,
  CodexResponseEventType,
  CodexRunTurnInput,
  CodexRunTurnRequest,
  CodexToolInputSchema,
  CodexWireContentBlock,
  CodexWireMessage,
  CodexWireThinkingLevel,
  CodexWireTool,
} from '@g4os/codex-types';

// CR-38 F-CR38-3: re-export da constante canônica para o consumer
// `frame.ts` construir o gate runtime via `new Set(CODEX_RESPONSE_EVENT_TYPES)`.
// `satisfies` em codex-types força paridade compile-time com a união
// `CodexResponseEvent['type']`.
export { CODEX_RESPONSE_EVENT_TYPES } from '@g4os/codex-types';
