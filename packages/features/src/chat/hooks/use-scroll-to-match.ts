import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect } from 'react';

export interface UseScrollToMatchOptions {
  readonly virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  readonly targetIndex: number | null;
  readonly align?: 'start' | 'center' | 'end' | 'auto';
}

export function useScrollToMatch({
  virtualizer,
  targetIndex,
  align = 'center',
}: UseScrollToMatchOptions): void {
  useEffect(() => {
    if (!virtualizer || targetIndex === null || targetIndex < 0) return;
    virtualizer.scrollToIndex(targetIndex, { align });
  }, [virtualizer, targetIndex, align]);
}
