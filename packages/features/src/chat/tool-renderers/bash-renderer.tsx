import { useTranslate } from '@g4os/ui';
import { CodeBlock } from '@g4os/ui/markdown';
import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';
import { registerToolRenderer } from './registry.tsx';

const BASH_TOOLS = new Set(['Bash', 'bash', 'execute_command', 'run_command']);

function BashComponent({ result }: ToolRendererComponent) {
  const { t } = useTranslate();
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const isError = typeof result === 'object' && result !== null && 'error' in result;
  const lines = text.split('\n').length;
  const summary =
    lines === 1
      ? t('chat.toolRenderer.bash.outputSingular')
      : t('chat.toolRenderer.bash.outputPlural', { count: lines });

  return (
    <CollapsibleResult summary={summary} isError={isError}>
      <CodeBlock className="language-bash">{text}</CodeBlock>
    </CollapsibleResult>
  );
}

registerToolRenderer({
  name: 'bash',
  canRender: (name) => BASH_TOOLS.has(name),
  Component: BashComponent,
});
