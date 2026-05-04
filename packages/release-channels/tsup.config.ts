import { defineConfig } from 'tsup';

// CR-18 F-RC1: V2 é ESM-only (`"type": "module"` em todos os pacotes).
// Format CJS estava duplicando build sem consumer — exports do package.json
// só declara `import`, então o `dist/index.cjs` ficava órfão. Drop CJS.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
