import path from 'node:path';
import { formatMissingEnv, loadSupabaseEnvFiles, validateSupabaseEnv } from '@g4os/auth/supabase';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const rootDir = path.resolve(__dirname, '../..');
const { env, filesLoaded } = loadSupabaseEnvFiles(rootDir);
// biome-ignore lint/style/noProcessEnv: composition root; sanitização controlada
const validation = validateSupabaseEnv({ ...process.env, ...env });
if (!validation.ok) {
  throw new Error(
    [
      'Boot bloqueado para desktop build/dev.',
      formatMissingEnv(validation.missing),
      `Arquivos carregados: ${filesLoaded.length > 0 ? filesLoaded.join(', ') : 'nenhum'}`,
    ].join('\n\n'),
  );
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      lib: {
        entry: 'src/main/index.ts',
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
      rollupOptions: {
        external: [
          'electron',
          'pino',
          'pino-pretty',
          'pino-roll',
          'pino-abstract-transport',
          'thread-stream',
          'sonic-boom',
        ],
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      lib: {
        entry: 'src/preload.ts',
        formats: ['cjs'],
        fileName: () => 'preload.cjs',
      },
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'preload.cjs' },
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
    build: {
      rollupOptions: {
        input: { main: path.resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    server: {
      port: 5173,
    },
  },
});
