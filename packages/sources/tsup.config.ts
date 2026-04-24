import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/interface/index.ts',
    'src/mcp-stdio/index.ts',
    'src/mcp-http/index.ts',
    'src/managed/index.ts',
    'src/oauth/index.ts',
    'src/lifecycle/index.ts',
    'src/planner/index.ts',
    'src/catalog/index.ts',
    'src/store/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
