import { PlatformProvider, ThemeProvider, TranslateProvider } from '@g4os/ui';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@g4os/ui/globals.css';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@g4os/features/workspaces';
import { TRPCProvider } from './ipc/trpc-provider.tsx';
import { electronPlatform } from './platform/electron-platform.ts';
import { router } from './router.ts';

const urlWorkspaceId = new URL(window.location.href).searchParams.get('workspaceId');
if (urlWorkspaceId) {
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, urlWorkspaceId);
  } catch {
    // storage unavailable; active workspace will resolve via default
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

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
