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
  // Optional/runtime deps que ficam no host (apps/desktop). Sem isto,
  // esbuild tenta resolver no build da lib e falha porque os pacotes
  // não estão no dep tree desta package — só do consumer.
  external: [
    '@sentry/electron/renderer',
    '@sentry/electron/main',
    '@sentry/node',
    'posthog-node',
    '@opentelemetry/sdk-node',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/exporter-trace-otlp-http',
  ],
});
