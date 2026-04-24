import type { ComponentType } from 'react';
import { useMemo } from 'react';
import type { ExtraProps } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block.tsx';
import { customBlockRegistry } from './custom-block-registry.ts';

export interface MarkdownRendererProps {
  readonly content: string;
  readonly isStreaming?: boolean;
  readonly customBlocks?: boolean;
  readonly className?: string;
}

function sanitizeIncompleteStreaming(content: string): string {
  const fenceCount = (content.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    const last = content.lastIndexOf('```');
    return content.slice(0, last);
  }
  return content;
}

import type { HTMLAttributes } from 'react';

type CodeProps = HTMLAttributes<HTMLElement> & ExtraProps;

function buildCodeComponent(useCustomBlocks: boolean): ComponentType<CodeProps> {
  return function CodeComponent({ className, children }: CodeProps) {
    const lang = className?.replace('language-', '') ?? '';
    if (useCustomBlocks && lang && customBlockRegistry.has(lang)) {
      const CustomComponent = customBlockRegistry.getRenderer(lang);
      if (!CustomComponent) return null;
      return <CustomComponent>{String(children ?? '').trim()}</CustomComponent>;
    }
    return <CodeBlock {...(className ? { className } : {})}>{children}</CodeBlock>;
  };
}

export function MarkdownRenderer({
  content,
  isStreaming = false,
  customBlocks = true,
  className,
}: MarkdownRendererProps) {
  const safeContent = useMemo(
    () => (isStreaming ? sanitizeIncompleteStreaming(content) : content),
    [content, isStreaming],
  );

  const components = useMemo(() => ({ code: buildCodeComponent(customBlocks) }), [customBlocks]);

  return (
    <div
      className={[
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent',
        'prose-code:before:content-none prose-code:after:content-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}
