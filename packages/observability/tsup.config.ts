import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/debug/index.ts',
    'src/memory/index.ts',
    'src/metrics/index.ts',
    'src/sdk/index.ts',
    'src/sentry/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
