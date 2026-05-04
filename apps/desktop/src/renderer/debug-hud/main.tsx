import '@g4os/ui/globals.css';
import { ThemeProvider, TranslateProvider } from '@g4os/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('debug-hud: #root not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <TranslateProvider defaultLocale="pt-BR">
        <App />
      </TranslateProvider>
    </ThemeProvider>
  </StrictMode>,
);
