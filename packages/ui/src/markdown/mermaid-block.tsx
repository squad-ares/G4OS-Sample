/**
 * MermaidBlock — renderer de diagramas Mermaid em messages do chat.
 *
 * Estado atual scaffold: graceful fallback que mostra o
 * código bruto numa `<pre>` estilizada. Quando a dep `mermaid` for
 * adicionada como catalog (pnpm-workspace.yaml) + import dinâmico for
 * resolvido, este componente passa a renderizar SVG real.
 *
 * Por que stub: `mermaid` é ~500KB minified — adicionar sem revisão de
 * bundle budget vira surpresa em performance gates. Decisão: cenário
 * funcional (raw code visível) entrega o caminho completo de
 * `customBlockRegistry` sem comprometer build.
 *
 * Para promover a impl real:
 * 1. `pnpm add mermaid -w` (ou via catalog: `mermaid: "^11.x"`)
 * 2. Substituir o `<pre>` fallback por `await mermaid.render(id, code)` lazy
 * 3. Theming: ler tema atual e passar `mermaid.initialize({ theme })`
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslate } from '../translate/translate-provider.tsx';

interface MermaidLibLike {
  initialize(config: { startOnLoad: boolean; theme?: string }): void;
  render(id: string, code: string): Promise<{ svg: string }>;
}

let mermaidLib: MermaidLibLike | null = null;
let mermaidLoadAttempted = false;

async function loadMermaid(): Promise<MermaidLibLike | null> {
  if (mermaidLib) return mermaidLib;
  if (mermaidLoadAttempted) return null;
  mermaidLoadAttempted = true;
  try {
    // Specifier opaco pra Vite/TS não tentar resolver no compile time —
    // mermaid é dep opcional (lazy via runtime).
    const specifier = 'mermaid';
    const mod = await import(/* @vite-ignore */ specifier);
    const lib = (mod.default ?? mod) as MermaidLibLike;
    lib.initialize({ startOnLoad: false, theme: 'dark' });
    mermaidLib = lib;
    return lib;
  } catch {
    return null;
  }
}

export interface MermaidBlockProps {
  readonly children: string;
}

export function MermaidBlock({ children }: MermaidBlockProps): React.JSX.Element {
  const { t } = useTranslate();
  const code = children.trim();
  const id = useId().replace(/:/g, '_');
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMermaid().then(async (lib) => {
      if (cancelled) return;
      if (!lib) {
        // Mermaid não disponível — graceful fallback mostra raw code.
        return;
      }
      try {
        const result = await lib.render(`mermaid-${id}`, code);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = result.svg;
          setRendered(true);
        }
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="rounded border border-critical/40 bg-critical/10 p-3 text-xs">
        <p className="font-medium">{t('markdown.mermaid.renderError')}</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-2">
      <div
        ref={containerRef}
        className={rendered ? 'rounded border border-foreground/10 p-3' : ''}
      />
      {rendered ? null : (
        <pre className="overflow-x-auto rounded border border-dashed border-foreground/20 bg-background/40 p-3 font-mono text-xs text-muted-foreground">
          {code}
        </pre>
      )}
    </div>
  );
}
