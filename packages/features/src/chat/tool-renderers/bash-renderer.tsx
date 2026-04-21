import { CodeBlock } from '@g4os/ui/markdown';
import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';
import { registerToolRenderer } from './registry.tsx';

const BASH_TOOLS = new Set(['Bash', 'bash', 'execute_command', 'run_command']);

function BashComponent({ result }: ToolRendererComponent) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const isError = typeof result === 'object' && result !== null && 'error' in result;
  const lines = text.split('\n').length;

  return (
    <CollapsibleResult
      summary={`Output — ${lines} line${lines === 1 ? '' : 's'}`}
      isError={isError}
    >
      <CodeBlock className="language-bash">{text}</CodeBlock>
    </CollapsibleResult>
  );
}

registerToolRenderer({
  name: 'bash',
  canRender: (name) => BASH_TOOLS.has(name),
  Component: BashComponent,
});
