import { CollapsibleResult } from './collapsible-result.tsx';
import type { ToolRendererComponent } from './registry.tsx';
import { registerToolRenderer } from './registry.tsx';

const SEARCH_TOOLS = new Set(['Glob', 'Grep', 'glob', 'grep', 'search']);

function SearchResultsComponent({ result }: ToolRendererComponent) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const lines = text.split('\n').filter(Boolean);

  return (
    <CollapsibleResult summary={`${lines.length} result${lines.length === 1 ? '' : 's'}`}>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered search results
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
