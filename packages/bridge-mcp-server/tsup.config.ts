import { defineConfig } from 'tsup';

// Formato CJS com shebang — alinhado com V1 bridge bundle Node-spawnable.
// `dts: false` porque `package.json` aponta `types: src/index.ts` (source-resolved);
// `.d.ts` gerados em dist seriam mortos e aumentariam o build time.
// Quando o ADR de transport for aceito e o skeleton promovido, reavaliar se
// o bundle deve ser ESM puro (sem shebang) ou CJS standalone com `#!/usr/bin/env node`.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
