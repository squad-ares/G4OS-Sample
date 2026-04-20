export { detectCapabilities } from './capabilities.ts';
export { ClaudeAgent, type ClaudeAgentOptions } from './claude-agent.ts';
export { mapConfig, mapContentBlock, mapMessages, mapTools } from './config/mapper.ts';
export {
  type ClaudeFactoryOptions,
  createClaudeFactory,
  supportsClaudeConnection,
} from './factory.ts';
export {
  applyPromptCache,
  applyPromptCache1hTtl,
  type PromptCacheOptions,
  type PromptCacheTtl,
  upgradeExistingMarkers,
} from './prompt-cache/cache-markers.ts';
export * from './providers/index.ts';
export {
  createEventMapperState,
  type EventMapperState,
  mapStopReason,
  mapStreamEvent,
} from './runner/event-mapper.ts';
export {
  StreamRunner,
  type StreamRunnerDeps,
  type StreamRunnerOptions,
} from './runner/stream-runner.ts';
export {
  type AccumulatedToolUse,
  parseToolInput,
  ToolUseAccumulator,
} from './runner/tool-accumulator.ts';
export type {
  ClaudeCacheControl,
  ClaudeContentBlockInput,
  ClaudeCreateMessageParams,
  ClaudeMessage,
  ClaudeProvider,
  ClaudeProviderCallContext,
  ClaudeProviderKind,
  ClaudeRequestOptions,
  ClaudeStreamEvent,
  ClaudeSystemBlock,
  ClaudeThinkingConfig,
  ClaudeToolParam,
} from './types.ts';
