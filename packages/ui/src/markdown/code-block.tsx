import { useState } from 'react';
import { cn } from '../libs/utils.ts';
import { useHighlightedHtml } from './use-highlighted-html.ts';

export interface CodeBlockProps {
  readonly className?: string;
  readonly children?: React.ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const lang = className?.replace('language-', '') ?? '';
  const isBlock = Boolean(lang || className?.startsWith('language-'));
  const code = String(children ?? '').replace(/\n$/, '');
  const html = useHighlightedHtml(isBlock ? code : '', isBlock ? lang || 'text' : '');
  const [copied, setCopied] = useState(false);

  if (!isBlock) {
    return (
      <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  }

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-foreground/10 bg-[#0d1117] text-sm">
      <div className="flex items-center justify-between border-b border-foreground/10 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
            copied ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-3 [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: (reason: shiki produces sanitized HTML from literal code strings — no user-controlled HTML)
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-foreground/80">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
