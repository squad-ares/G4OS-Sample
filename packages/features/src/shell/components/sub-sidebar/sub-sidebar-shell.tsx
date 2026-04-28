import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useTranslate } from '@g4os/ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export interface SubSidebarShellProps {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

const STORAGE_KEY = 'g4os.shell.subsidebar.collapsed';
// Posição do botão flutuante quando subsidebar está colapsada. Definido
// pra ficar alinhado com a área do app-mark (topo absoluto da sidebar
// principal) e bem encostado na lateral esquerda — UX mais discreta.
const TOGGLE_TOP_OFFSET = '52px';
const TOGGLE_LEFT_OFFSET = '64px';

/**
 * Subsidebar contextual com toggle de collapse persistido em
 * `localStorage` (`g4os.shell.subsidebar.collapsed`). Estado é
 * compartilhado via storage event entre tabs/janelas.
 *
 * Animação (CR-UX 2026-04-27):
 *   - aside transiciona `width` de `w-72` (288px) para `w-0` em 200ms
 *     ease-in-out. Conteúdo fade-out via opacity sobreposto.
 *   - Quando colapsada, um botão flutuante "expand" aparece ancorado no
 *     topo da área (mesma altura do primeiro ícone da sidebar principal),
 *     em vez de uma barra lateral fina cheia. UX consistente com Linear.
 */
function readPersisted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePersisted(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // localStorage indisponível (modo privado) — toggle continua na sessão.
  }
}

export function SubSidebarShell({ header, footer, children }: SubSidebarShellProps) {
  const { t } = useTranslate();
  const [collapsed, setCollapsed] = useState<boolean>(() => readPersisted());

  useEffect(() => {
    writePersisted(collapsed);
  }, [collapsed]);

  const toggle = (): void => setCollapsed((c) => !c);

  return (
    <TooltipProvider delayDuration={300}>
      {/* Botão flutuante de "expand" — sempre montado, fade in/out via
          opacity para acompanhar a transição da aside sem snap brusco. */}
      <div
        className={`titlebar-no-drag pointer-events-none absolute z-20 transition-opacity duration-200 ease-in-out ${
          collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ top: TOGGLE_TOP_OFFSET, left: TOGGLE_LEFT_OFFSET }}
        aria-hidden={!collapsed}
      >
        <Tooltip>
          <TooltipTrigger asChild={true}>
            <button
              type="button"
              onClick={toggle}
              aria-label={t('shell.subsidebar.expand')}
              tabIndex={collapsed ? 0 : -1}
              className="pointer-events-auto flex size-9 cursor-pointer items-center justify-center rounded-[11px] border border-foreground/8 bg-background text-foreground/60 shadow-minimal transition-colors hover:bg-accent/12 hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" aria-hidden={true} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t('shell.subsidebar.expand')}
          </TooltipContent>
        </Tooltip>
      </div>

      <aside
        // CR-UX: width transition + opacity no conteúdo. `overflow-hidden` na
        // aside evita scrollbar piscando durante a animação. Quando colapsada,
        // `w-0` + `opacity-0` + `pointer-events-none` removem o conteúdo do
        // hit-test mas mantêm a estrutura no DOM (sem unmount = sem perder
        // estado interno de filhos).
        className={`titlebar-no-drag relative z-10 hidden h-full shrink-0 flex-col overflow-hidden rounded-[16px] bg-background shadow-middle transition-[width,opacity] duration-200 ease-in-out lg:flex ${
          collapsed ? 'pointer-events-none w-0 opacity-0' : 'w-72 opacity-100'
        }`}
        aria-hidden={collapsed}
      >
        {header ? (
          <div className="relative z-10 flex shrink-0 items-start justify-between gap-2 px-4 pb-2 pt-3">
            <div className="min-w-0 flex-1">{header}</div>
            <Tooltip>
              <TooltipTrigger asChild={true}>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('shell.subsidebar.collapse')}
                  aria-expanded={true}
                  tabIndex={collapsed ? -1 : 0}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent/12 hover:text-foreground"
                >
                  <PanelLeftClose className="size-4" aria-hidden={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {t('shell.subsidebar.collapse')}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          // Sem header — toggle ancorado no canto, sobreposto ao conteúdo.
          <div className="absolute right-2 top-2 z-20">
            <Tooltip>
              <TooltipTrigger asChild={true}>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('shell.subsidebar.collapse')}
                  aria-expanded={true}
                  tabIndex={collapsed ? -1 : 0}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-background/80 text-foreground/60 backdrop-blur transition-colors hover:bg-accent/12 hover:text-foreground"
                >
                  <PanelLeftClose className="size-4" aria-hidden={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {t('shell.subsidebar.collapse')}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-foreground/5 bg-foreground/[0.02] px-3 py-2">
            {footer}
          </div>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}
