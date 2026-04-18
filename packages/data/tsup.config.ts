import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/sqlite/index.ts', 'src/schema/index.ts', 'src/drizzle.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
