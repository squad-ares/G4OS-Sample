import { useEffect, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 100;

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
}

export function useAutoScroll(
  ref: React.RefObject<HTMLElement | null>,
  isStreaming: boolean,
): void {
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target: HTMLElement = el;

    function onScroll() {
      wasNearBottomRef.current = isNearBottom(target);
    }
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isStreaming) return;

    const observer = new ResizeObserver(() => {
      if (wasNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, isStreaming]);
}
