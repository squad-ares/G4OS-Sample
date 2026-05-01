import { PlatformProvider, ThemeProvider, TranslateProvider } from '@g4os/ui';
import { registerBuiltinCustomBlocks } from '@g4os/ui/markdown';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@g4os/ui/globals.css';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@g4os/features/workspaces';
import { TRPCProvider } from './ipc/trpc-provider.tsx';
import {
  initRendererSentry,
  reportRendererException,
  startWebVitalsReporting,
} from './observability/init-sentry.ts';
import { electronPlatform } from './platform/electron-platform.ts';
import { router } from './router.ts';

const urlWorkspaceId = new URL(window.location.href).searchParams.get('workspaceId');
if (urlWorkspaceId) {
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, urlWorkspaceId);
  } catch (cause) {
    // localStorage indisponível (private mode, quota, sandbox). Workspace
    // ativo resolve via default; reportar pra observability sem bloquear.
    reportRendererException(cause, { context: 'localStorage.setItem.activeWorkspace' });
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

// Init Sentry no renderer antes do render. Sem DSN é NOOP;
// erros que ocorrem durante providers já passam pelo handler global do
// SDK uma vez que init resolveu.
void initRendererSentry().catch(() => {
  // Init failure nao deve bloquear UI. `init-sentry.ts` ja loga.
});

// Registra MermaidBlock no customBlockRegistry — markdown messages com
// ```mermaid renderizam diagramas. Idempotente.
registerBuiltinCustomBlocks();

// PerformanceObservers para LCP/CLS/INP. Disconnect ficam
// no closure (vida do renderer) — sem nada pra desfazer porque não há
// hot-restart sem refresh full.
startWebVitalsReporting();

createRoot(root).render(
  <StrictMode>
    <TranslateProvider>
      <ThemeProvider>
        <PlatformProvider api={electronPlatform}>
          <TRPCProvider>
            <RouterProvider router={router} />
          </TRPCProvider>
        </PlatformProvider>
      </ThemeProvider>
    </TranslateProvider>
  </StrictMode>,
);
