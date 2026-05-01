/**
 * Hook que escuta deep-links forwarded do main e navega via TanStack
 * Router. Mapeamento path → rota do renderer:
 *
 *   - `/workspace/<id>` → `/workspaces/<id>`
 *   - `/workspace/<id>/sessions/<sid>` → `/workspaces/<id>/sessions/<sid>`
 *   - `/session/<sid>` → busca workspace via tRPC e navega; sem auth pula
 *   - `/project/<id>` → `/projects/<id>` (renderer route exists?)
 *   - `/settings` ou `/settings/<cat>` → settings hub
 *   - `/migration` → wizard de migração V1 → V2
 *   - `/auth/callback` ou `/oauth/callback` → consumido pelo auth-runtime
 *   - `/news`, `/marketplace` → routes equivalentes
 *
 * Auth callbacks NÃO são roteados aqui — são consumidos pelo
 * `auth-runtime` no main antes de chegar ao deep-link handler. Se chegou
 * aqui é porque o user clicou num link que escapou — tratamos como root.
 */

import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

interface DeepLinkPayload {
  readonly host: string;
  readonly path: string;
  readonly search: string;
}

interface DeepLinksBridge {
  onNavigate(callback: (payload: DeepLinkPayload) => void): () => void;
}

declare global {
  interface Window {
    g4osDeepLinks?: DeepLinksBridge;
  }
}

export function useDeepLinkNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const bridge = window.g4osDeepLinks;
    if (!bridge) return;

    return bridge.onNavigate((payload) => {
      const target = mapPathToRoute(payload.path);
      if (!target) return;
      void navigate({ to: target });
    });
  }, [navigate]);
}

function mapPathToRoute(path: string): string | null {
  // workspace/<id>/sessions/<sid> — match antes do workspace simples
  const sessionMatch = path.match(
    /^\/workspace\/([a-z0-9_-]{1,64})\/sessions\/([a-z0-9_-]{1,64})\/?$/i,
  );
  if (sessionMatch) {
    return `/workspaces/${sessionMatch[1]}/sessions/${sessionMatch[2]}`;
  }

  const wsMatch = path.match(/^\/workspace\/([a-z0-9_-]{1,64})\/?$/i);
  if (wsMatch) return `/workspaces/${wsMatch[1]}`;

  if (path.match(/^\/migration\/?$/i)) return '/migration';
  if (path.match(/^\/auth\/callback\/?$/i)) return '/';
  if (path.match(/^\/oauth\/callback\/?$/i)) return '/';
  if (path === '/' || path === '') return '/';

  // settings / news / marketplace mapeiam diretamente como prefixo se a
  // route existir. Se não tem rota equivalente, retorna null e ignora.
  if (path.match(/^\/settings\/?$/i)) return '/settings';
  if (path.match(/^\/news\/?$/i)) return '/news';
  if (path.match(/^\/marketplace\/?$/i)) return '/marketplace';

  return null;
}
