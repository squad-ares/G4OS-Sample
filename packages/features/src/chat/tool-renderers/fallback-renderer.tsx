import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';

export function FallbackRenderer({
  result,
  toolUseId: _toolUseId,
}: ToolRendererComponent & { toolName: string }) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const isError = typeof result === 'object' && result !== null && 'error' in result;

  return (
    <CollapsibleResult summary={isError ? 'Error' : 'Result'} isError={isError}>
      <pre className="overflow-x-auto font-mono text-[11px] text-foreground/80 whitespace-pre-wrap">
        {text}
      </pre>
    </CollapsibleResult>
  );
}
