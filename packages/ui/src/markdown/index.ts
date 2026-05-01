export { CodeBlock, type CodeBlockProps } from './code-block.tsx';
export { customBlockRegistry } from './custom-block-registry.ts';
export { MarkdownRenderer, type MarkdownRendererProps } from './markdown-renderer.tsx';
export { MermaidBlock, type MermaidBlockProps } from './mermaid-block.tsx';
export { useHighlightedHtml } from './use-highlighted-html.ts';

import { customBlockRegistry } from './custom-block-registry.ts';
import { MermaidBlock } from './mermaid-block.tsx';

/**
 * Registra os custom blocks built-in. Chamar uma vez no boot do renderer.
 * Idempotente — registrar 2x sobrescreve mas não quebra.
 */
export function registerBuiltinCustomBlocks(): void {
  customBlockRegistry.register('mermaid', MermaidBlock);
}
