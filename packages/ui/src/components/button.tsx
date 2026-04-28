import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../libs/utils.ts';

const buttonVariants = cva(
  // CR-UX: `cursor-pointer` no base + `transition-colors` (não `transition-all`)
  // pra evitar transitions caras (transform, shadow). Hover muda só cor +
  // opacity nas variantes — sem `translate` pra evitar movimento que parece
  // "saltar" e atrapalha leitura/clique.
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[16px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background shadow-[0_18px_34px_rgba(0,31,53,0.18)] hover:bg-foreground/92',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_18px_34px_rgba(132,46,32,0.22)] hover:bg-destructive/92',
        outline:
          'border border-foreground/12 bg-background/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:border-accent/60 hover:bg-accent/8',
        secondary:
          'bg-foreground/6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-foreground/10',
        ghost: 'hover:bg-foreground/6',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2.5',
        sm: 'h-9 rounded-[14px] px-3.5 text-xs',
        lg: 'h-11 rounded-[18px] px-8',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
