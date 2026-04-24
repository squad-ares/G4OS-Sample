/**
 * TASK-11-00-11: paridade de transcripts legados.
 *
 * Snapshot estrutural (HTML estático) por fixture. A ideia é: se alguém
 * trocar o parser markdown, o renderer de code block ou o registro de
 * custom blocks, a snapshot quebra e CI falha antes do PR entrar.
 *
 * SSR-only (`renderToStaticMarkup`) é deliberado:
 *  - não precisa de jsdom nem @testing-library/react
 *  - componentes client-only (Shiki via `useEffect`) caem no fallback
 *    determinístico (`<pre><code>`), o que deixa a snapshot estável
 *  - cobertura foca em estrutura semântica — não pixel-perfect visual
 */

import { customBlockRegistry, MarkdownRenderer } from '@g4os/ui/markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { FallbackRenderer } from '../../tool-renderers/fallback-renderer.tsx';
import { MARKDOWN_FIXTURES, TOOL_RESULT_FIXTURES } from './fixtures.ts';

describe('legacy transcript parity — markdown', () => {
  for (const fixture of MARKDOWN_FIXTURES) {
    it(`renders ${fixture.id} — ${fixture.description}`, () => {
      const html = renderToStaticMarkup(
        <MarkdownRenderer
          content={fixture.content}
          {...(fixture.isStreaming ? { isStreaming: true } : {})}
        />,
      );
      expect(html).toMatchSnapshot();
    });
  }
});

describe('legacy transcript parity — incomplete streaming', () => {
  it('sanitizes an open code fence without throwing', () => {
    const content = ['Aqui está o diff:', '', '```diff', '- old', '+ new'].join('\n');
    expect(() =>
      renderToStaticMarkup(<MarkdownRenderer content={content} isStreaming={true} />),
    ).not.toThrow();
  });

  it('drops incomplete fence when streaming', () => {
    const content = ['```python', 'def f():', '    pass'].join('\n');
    const streaming = renderToStaticMarkup(
      <MarkdownRenderer content={content} isStreaming={true} />,
    );
    expect(streaming).not.toContain('<pre');
  });
});

describe('legacy transcript parity — custom block fallback rule', () => {
  afterEach(() => {
    customBlockRegistry.unregister('partnercards');
  });

  it('renders unregistered partnercards as plain code block (safe fallback)', () => {
    const content = ['```partnercards', '[{"title":"A"}]', '```'].join('\n');
    const html = renderToStaticMarkup(<MarkdownRenderer content={content} />);
    expect(html).toMatchSnapshot('partnercards-fallback');
    expect(html).toContain('partnercards');
  });

  it('uses registered renderer when available', () => {
    customBlockRegistry.register('partnercards', function Partner({ children }) {
      return <div data-testid="partnercards-registered">{children}</div>;
    });
    const content = ['```partnercards', '[{"title":"A"}]', '```'].join('\n');
    const html = renderToStaticMarkup(<MarkdownRenderer content={content} />);
    expect(html).toContain('data-testid="partnercards-registered"');
    expect(html).not.toContain('language-partnercards');
  });

  it('still falls back when customBlocks is disabled', () => {
    customBlockRegistry.register('partnercards', function Partner({ children }) {
      return <div data-testid="partnercards-registered">{children}</div>;
    });
    const content = ['```partnercards', '[{"title":"A"}]', '```'].join('\n');
    const html = renderToStaticMarkup(<MarkdownRenderer content={content} customBlocks={false} />);
    expect(html).not.toContain('data-testid="partnercards-registered"');
  });
});

describe('legacy transcript parity — tool results', () => {
  for (const fixture of TOOL_RESULT_FIXTURES) {
    it(`renders ${fixture.id} — ${fixture.description}`, () => {
      const html = renderToStaticMarkup(
        <FallbackRenderer
          result={fixture.result}
          toolUseId="toolu_fixture"
          toolName={fixture.toolName}
        />,
      );
      expect(html).toMatchSnapshot();
    });
  }
});
