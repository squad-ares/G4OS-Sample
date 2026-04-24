import { memo } from 'react';
import { FallbackRenderer } from './fallback-renderer.tsx';
import { resolveToolRenderer } from './registry.tsx';

interface ToolResultDispatcherProps {
  readonly toolName: string;
  readonly result: unknown;
  readonly toolUseId: string;
}

export const ToolResultDispatcher = memo(function ToolResultDispatcher({
  toolName,
  result,
  toolUseId,
}: ToolResultDispatcherProps) {
  const renderer = resolveToolRenderer(toolName, result);
  if (renderer) {
    return <renderer.Component result={result} toolUseId={toolUseId} />;
  }
  return <FallbackRenderer toolName={toolName} result={result} toolUseId={toolUseId} />;
});
