import { useTranslate } from '@g4os/ui';
import { CodeBlock } from '@g4os/ui/markdown';
import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';
import { registerToolRenderer } from './registry.tsx';

const READ_TOOLS = new Set(['read_file', 'Read', 'View']);

function ReadFileComponent({ result }: ToolRendererComponent) {
  const { t } = useTranslate();
  const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const lines = content.split('\n').length;
  const summary =
    lines === 1
      ? t('chat.toolRenderer.readFile.summarySingular')
      : t('chat.toolRenderer.readFile.summaryPlural', { count: lines });

  return (
    <CollapsibleResult summary={summary}>
      <CodeBlock className="language-text">{content}</CodeBlock>
    </CollapsibleResult>
  );
}

registerToolRenderer({
  name: 'read-file',
  canRender: (name) => READ_TOOLS.has(name),
  Component: ReadFileComponent,
});
