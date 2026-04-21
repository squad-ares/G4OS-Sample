import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { AnimatePresence, motion } from 'motion/react';
import type * as React from 'react';

// Radix primitives (unchanged)
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

// Spring config - snappy, no bounce
const springTransition = {
  type: 'spring' as const,
  stiffness: 1400,
  damping: 75,
};

interface AnimatedCollapsibleContentProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * AnimatedCollapsibleContent - Motion-powered collapsible content
 *
 * Uses spring physics to animate height (0 → auto) and opacity.
 * Motion handles height: "auto" natively, which CSS cannot do.
 */
function AnimatedCollapsibleContent({
  isOpen,
  children,
  className,
}: Readonly<AnimatedCollapsibleContentProps>) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={springTransition}
          className={className}
          style={{ clipPath: 'inset(0 -20px)' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export {
  AnimatedCollapsibleContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  springTransition,
};
