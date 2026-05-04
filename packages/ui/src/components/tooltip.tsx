import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { cn } from '../libs/utils.ts';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Border soft: `border-foreground/8` em vez do default `border` (token
        // de alto contraste). Em dark mode o default era praticamente branco
        // sólido contra fundo escuro, criando moldura agressiva. /8 dá
        // separação visual sem competir com o conteúdo.
        // z-tooltip (55) fica acima de dropdown/popover (40) mas não requer
        // estar sobre modal (50) — tooltip sobre dialog é raro e geralmente
        // não desejado. Token semântico garante que a hierarquia se ajusta
        // quando --z-modal mudar. ADR-0108.
        'z-tooltip overflow-hidden rounded-md border border-foreground/8 bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
// Literal em vez de delegado (F-CR49-21) — React DevTools mostra
// 'TooltipContent' em vez do nome interno Radix 'Tooltip.Content'.
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
