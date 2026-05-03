/**
 * Hook que assina o stream de snapshots do aggregator via `window.debugHud.subscribe`.
 *
 * Aggregator é pausado quando ninguém está assinando, então o hook
 * dispara o tick ao montar e libera no unmount.
 */

import { useEffect, useState } from 'react';
import type { HudSnapshot } from '../../debug-hud-types.ts';

export function useHudSnapshot(): HudSnapshot | null {
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  useEffect(() => {
    if (!window.debugHud) return;
    const unsub = window.debugHud.subscribe('snapshot', (data: unknown) => {
      setSnapshot(data as HudSnapshot);
    });
    return unsub;
  }, []);
  return snapshot;
}
