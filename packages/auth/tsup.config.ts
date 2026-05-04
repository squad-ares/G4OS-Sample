import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/otp/index.ts',
    'src/managed-login/index.ts',
    'src/entitlement/index.ts',
    'src/refresh/index.ts',
    // F-CR32-8: subpath `./supabase` declarado em package.json mas ausente
    // do entry array — `dist/supabase/` nunca era gerado, quebrando
    // consumidores que preferem dist (publish, pnpm pack).
    'src/supabase/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
});
