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
  CodexFrameDecoder,
  CodexFrameEncoder,
  CodexHandshakeRequest,
  CodexRequest,
  CodexResponseEvent,
  CodexResponseEventType,
  CodexRunTurnInput,
  CodexRunTurnRequest,
  CodexWireContentBlock,
  CodexWireMessage,
  CodexWireTool,
} from '@g4os/codex-types';
