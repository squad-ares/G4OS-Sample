import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/interface/index.ts',
    'src/claude/index.ts',
    'src/codex/index.ts',
    'src/openai/index.ts',
    'src/google/index.ts',
    'src/permissions/index.ts',
    'src/streaming/index.ts',
    'src/shared/index.ts',
    'src/tools/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
