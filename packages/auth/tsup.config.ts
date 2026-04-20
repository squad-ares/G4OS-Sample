import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/otp/index.ts',
    'src/managed-login/index.ts',
    'src/entitlement/index.ts',
    'src/refresh/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
