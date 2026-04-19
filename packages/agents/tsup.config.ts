import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/interface/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
