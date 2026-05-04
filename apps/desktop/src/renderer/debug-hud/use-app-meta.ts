/**
 * Hook que busca metadata do app (versão, plataforma, versões de runtime)
 * via IPC `debug-hud:get-app-meta`. Renderer não tem acesso direto a
 * `process.versions` nem `electron.app.getVersion()` — vai pelo bridge.
 *
 * Resolvido lazy ao montar o hook; cache simples por sessão (a metadata
 * não muda durante o ciclo de vida do HUD).
 */

import { useEffect, useState } from 'react';

export interface AppMeta {
  readonly appVersion: string;
  readonly platform: string;
  readonly electronVersion: string | null;
  readonly nodeVersion: string;
}

const FALLBACK_META: AppMeta = {
  appVersion: '0.0.0',
  platform: '—',
  electronVersion: null,
  nodeVersion: '—',
};

let cached: AppMeta | null = null;

export function useAppMeta(): AppMeta {
  const [meta, setMeta] = useState<AppMeta>(cached ?? FALLBACK_META);

  useEffect(() => {
    if (cached) return;
    if (!window.debugHud?.getAppMeta) return;
    let cancelled = false;
    void window.debugHud.getAppMeta().then((value) => {
      if (cancelled) return;
      if (!isAppMeta(value)) return;
      cached = value;
      setMeta(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return meta;
}

function isAppMeta(value: unknown): value is AppMeta {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['appVersion'] === 'string' &&
    typeof v['platform'] === 'string' &&
    (v['electronVersion'] === null || typeof v['electronVersion'] === 'string') &&
    typeof v['nodeVersion'] === 'string'
  );
}
