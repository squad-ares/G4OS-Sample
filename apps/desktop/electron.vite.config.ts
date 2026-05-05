import path from 'node:path';
import { formatMissingEnv, loadSupabaseEnvFiles, validateSupabaseEnv } from '@g4os/auth/supabase';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const rootDir = path.resolve(__dirname, '../..');
const { env, filesLoaded } = loadSupabaseEnvFiles(rootDir);
// biome-ignore lint/style/noProcessEnv: composition root; sanitização controlada
const mergedEnv = { ...process.env, ...env };
// Validação Supabase só em `dev` — build CI não precisa de credenciais
// (serão injetadas em runtime). Packaging real sem credenciais gera
// installer funcional que falha graciosamente no primeiro login.
const isBuildMode =
  process.argv.includes('build') ||
  mergedEnv['CI'] === 'true' ||
  mergedEnv['G4OS_SKIP_SUPABASE_VALIDATION'] === '1';

if (!isBuildMode) {
  const validation = validateSupabaseEnv(mergedEnv);
  if (!validation.ok) {
    throw new Error(
      [
        'Boot bloqueado para desktop dev.',
        formatMissingEnv(validation.missing),
        `Arquivos carregados: ${filesLoaded.length > 0 ? filesLoaded.join(', ') : 'nenhum'}`,
      ].join('\n\n'),
    );
  }
}

// Constantes embutidas em build time. SUPABASE_ANON_KEY é desenhada para
// ser pública (proteção real está em RLS no servidor) — pode entrar no
// bundle. Em CI release, secrets do GitHub injetam via env. Em dev, vem
// dos arquivos .env. Em build sem credenciais, fica string vazia e o app
// reporta erro gracioso no login.
const buildTimeDefines = {
  __G4OS_SUPABASE_URL__: JSON.stringify(mergedEnv['SUPABASE_URL'] ?? ''),
  __G4OS_SUPABASE_ANON_KEY__: JSON.stringify(
    mergedEnv['SUPABASE_ANON_KEY'] ?? mergedEnv['SUPABASE_PUBLISHABLE_KEY'] ?? '',
  ),
  // TASK-10B-13: Sentry DSN/env/release injetados em build time. Em dev
  // sem env vars o `initSentry` retorna NOOP (sem download do SDK, sem
  // overhead). Mesma convenção das vars Supabase acima.
  __G4OS_SENTRY_DSN__: JSON.stringify(mergedEnv['G4OS_SENTRY_DSN'] ?? ''),
  __G4OS_SENTRY_ENVIRONMENT__: JSON.stringify(
    mergedEnv['G4OS_SENTRY_ENVIRONMENT'] ?? (isBuildMode ? 'production' : 'development'),
  ),
  __G4OS_SENTRY_RELEASE__: JSON.stringify(
    mergedEnv['G4OS_SENTRY_RELEASE'] ?? mergedEnv['npm_package_version'] ?? '',
  ),
  // Endpoint do backend gerenciado (transcription, etc.). Em dev local sem
  // a var, os serviços dependentes degradam para "sem provider gerenciado".
  __G4OS_MANAGED_API_BASE__: JSON.stringify(mergedEnv['G4OS_MANAGED_API_BASE'] ?? ''),
  // URL base do viewer (feed de news, etc.). Fallback hard-coded usado quando
  // a var não está presente (dev/staging sem override).
  __G4OS_VIEWER_URL__: JSON.stringify(mergedEnv['G4OS_VIEWER_URL'] ?? ''),
  // Distribution flavor lido por `platform-info.ts`. String literal key →
  // esbuild pode substituir inline mesmo no bundle do pacote @g4os/platform.
  'process.env.G4OS_DISTRIBUTION_FLAVOR': JSON.stringify(
    mergedEnv['G4OS_DISTRIBUTION_FLAVOR'] ?? 'public',
  ),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    define: buildTimeDefines,
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/main/index.ts'),
        },
        external: [
          'electron',
          'pino',
          'pino-pretty',
          'pino-roll',
          'pino-abstract-transport',
          'thread-stream',
          'sonic-boom',
        ],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      // Multiple entries (preload main + preload-debug-hud) — `lib` aceita
      // só um. Usar `rollupOptions.input` direto resolve.
      rollupOptions: {
        input: {
          preload: path.resolve(__dirname, 'src/preload.ts'),
          'preload-debug-hud': path.resolve(__dirname, 'src/preload-debug-hud.ts'),
        },
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    plugins: [
      react(),
      tailwindcss(),
      tanstackRouter({
        routesDirectory: path.resolve(__dirname, 'src/renderer/routes'),
        generatedRouteTree: path.resolve(__dirname, 'src/renderer/routeTree.gen.ts'),
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
      },
    },
    define: buildTimeDefines,
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'src/renderer/index.html'),
          'debug-hud': path.resolve(__dirname, 'src/renderer/debug-hud/index.html'),
        },
      },
    },
    server: {
      port: 5173,
    },
  },
});
