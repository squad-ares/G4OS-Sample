import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sqlite/index.ts',
    'src/schema/index.ts',
    'src/drizzle.ts',
    'src/migrations/index.ts',
    'src/events/index.ts',
    'src/attachments/index.ts',
    'src/backup/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
