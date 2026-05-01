/**
 * `PdfPreview` — renderer inline de PDF em mensagens/attachments do chat.
 *
 * Estado atual: graceful fallback que mostra um placeholder com nome do
 * arquivo + ícone até a dep `react-pdf` ser adicionada. Quando promovido,
 * renderiza primeira página como thumbnail e mostra controles de
 * navegação.
 *
 * Por que stub: `react-pdf` carrega `pdfjs-dist` (~2 MB) e exige worker
 * bundle setup. Adicionar sem revisão de bundle budget vira surpresa em
 * performance gates. Decisão: cenário funcional (placeholder com ação)
 * entrega contrato sem comprometer build.
 *
 * Para promover a impl real:
 * 1. `pnpm add react-pdf -w` (catalog: `react-pdf: "^9.x"`)
 * 2. Substituir o placeholder por `<Document file={src}>` + `<Page pageNumber={1} />`
 * 3. Configurar pdfjs worker via `pdfjs.GlobalWorkerOptions.workerSrc`
 * 4. Adicionar controles de página + zoom
 */

import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslate } from '../translate/translate-provider.tsx';

interface ReactPdfDocumentProps {
  readonly file: string | Uint8Array;
  readonly onLoadError?: (error: Error) => void;
  readonly children: React.ReactNode;
}

interface ReactPdfPageProps {
  readonly pageNumber: number;
  readonly width?: number;
}

interface ReactPdfLib {
  Document: React.ComponentType<ReactPdfDocumentProps>;
  Page: React.ComponentType<ReactPdfPageProps>;
}

// CR-18 F-U2: memoiza a Promise (não a flag) — múltiplos PDFs renderizando
// simultaneamente compartilham o mesmo carregamento. Versão antiga setava
// `reactPdfLoadAttempted=true` antes do `await import` resolver e o 2º bloco
// recebia null mesmo após o 1º ter sucesso.
let reactPdfPromise: Promise<ReactPdfLib | null> | null = null;

function loadReactPdf(): Promise<ReactPdfLib | null> {
  if (reactPdfPromise) return reactPdfPromise;
  reactPdfPromise = (async () => {
    try {
      // Specifier opaco pra Vite/TS não tentar resolver no compile time —
      // react-pdf é dep opcional (lazy via runtime).
      const specifier = 'react-pdf';
      const mod = (await import(/* @vite-ignore */ specifier)) as Partial<ReactPdfLib>;
      if (!mod.Document || !mod.Page) return null;
      return { Document: mod.Document, Page: mod.Page };
    } catch {
      return null;
    }
  })();
  return reactPdfPromise;
}

export interface PdfPreviewProps {
  /** URL ou bytes do PDF. URL é preferível — react-pdf aceita data URL também. */
  readonly src: string | Uint8Array;
  /** Nome do arquivo pra fallback acessível. */
  readonly fileName: string;
  /** Largura preferida do preview em px. Default 320. */
  readonly width?: number;
  /** Hook opcional pra ação "abrir externamente" no fallback. */
  readonly onOpenExternal?: () => void;
}

export function PdfPreview({
  src,
  fileName,
  width = 320,
  onOpenExternal,
}: PdfPreviewProps): React.JSX.Element {
  const { t } = useTranslate();
  const [lib, setLib] = useState<ReactPdfLib | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadReactPdf().then((loaded) => {
      if (!cancelled) setLib(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded border border-critical/40 bg-critical/10 p-3 text-xs">
        <p className="font-medium">{t('markdown.pdf.renderError')}</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (lib) {
    const { Document, Page } = lib;
    return (
      <div className="my-2 overflow-hidden rounded border border-foreground/10 bg-background/40">
        <Document file={src} onLoadError={(e) => setError(e.message)}>
          <Page pageNumber={1} width={width} />
        </Document>
      </div>
    );
  }

  // Fallback: card com nome + ícone PDF + botão "abrir externamente"
  // quando provedor for fornecido.
  return (
    <div className="my-2 flex items-center gap-3 rounded border border-foreground/10 bg-background/40 p-3 text-xs">
      <div className="flex h-10 w-8 items-center justify-center rounded border border-foreground/20 bg-foreground/5 text-muted-foreground">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{fileName}</p>
        <p className="text-muted-foreground">{t('markdown.pdf.previewUnavailable')}</p>
      </div>
      {onOpenExternal ? (
        <button
          type="button"
          onClick={onOpenExternal}
          className="shrink-0 rounded border border-foreground/15 px-2 py-1 text-[11px] font-medium hover:bg-accent/15"
        >
          {t('markdown.pdf.openExternal')}
        </button>
      ) : null}
    </div>
  );
}
