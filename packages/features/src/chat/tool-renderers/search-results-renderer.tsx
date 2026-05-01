import { useTranslate } from '@g4os/ui';
import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';
import { registerToolRenderer } from './registry.tsx';

const SEARCH_TOOLS = new Set(['Glob', 'Grep', 'glob', 'grep', 'search']);

function SearchResultsComponent({ result }: ToolRendererComponent) {
  const { t } = useTranslate();
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const lines = text.split('\n').filter(Boolean);
  const summary =
    lines.length === 1
      ? t('chat.toolRenderer.search.resultsSingular')
      : t('chat.toolRenderer.search.resultsPlural', { count: lines.length });

  return (
    <CollapsibleResult summary={summary}>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="font-mono text-[11px] text-foreground/80 truncate">
            {line}
          </li>
        ))}
      </ul>
    </CollapsibleResult>
  );
}

registerToolRenderer({
  name: 'search',
  canRender: (name) => SEARCH_TOOLS.has(name),
  Component: SearchResultsComponent,
});
