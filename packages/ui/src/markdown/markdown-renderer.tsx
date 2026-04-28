import type { ComponentType, HTMLAttributes } from 'react';
import { useMemo } from 'react';
import type { ExtraProps } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block.tsx';
import { customBlockRegistry } from './custom-block-registry.ts';

export interface MarkdownRendererProps {
  readonly content: string;
  readonly isStreaming?: boolean;
  readonly customBlocks?: boolean;
  readonly className?: string;
}

/**
 * Schema permissivo para markdown vindo de agentes/tools. Estende o
 * defaultSchema do `rehype-sanitize` permitindo:
 * - `class` global (para syntax highlighting do CodeBlock e custom blocks)
 * - `style` apenas em `code`/`pre`/`span` (Shiki injeta cores inline)
 * - `target` + `rel` em `a`
 * - GFM tables já cobertas pelo defaultSchema
 *
 * Bloqueia `<script>`, `<iframe>`, `<object>`, `<embed>`, `on*` handlers,
 * e qualquer URL que não seja `http(s):`/`mailto:`/`#`. Sem este sanitize
 * o `rehypeRaw` deixava XSS direto via `<img onerror>` etc.
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'class'],
    code: [...(defaultSchema.attributes?.['code'] ?? []), 'style'],
    pre: [...(defaultSchema.attributes?.['pre'] ?? []), 'style'],
    span: [...(defaultSchema.attributes?.['span'] ?? []), 'style'],
    a: [
      ...(defaultSchema.attributes?.['a'] ?? []),
      ['target', '_blank'],
      ['rel', 'noopener', 'noreferrer'],
    ],
  },
};

function sanitizeIncompleteStreaming(content: string): string {
  const fenceCount = (content.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    const last = content.lastIndexOf('```');
    return content.slice(0, last);
  }
  return content;
}

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
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}
