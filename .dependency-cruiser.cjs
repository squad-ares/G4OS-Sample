/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ========== LAYERS ==========
    {
      name: 'kernel-is-foundation',
      comment: 'kernel nao pode depender de nada interno',
      severity: 'error',
      from: { path: '^packages/kernel' },
      to: { path: '^packages/(?!kernel)' },
    },
    {
      name: 'platform-only-on-kernel',
      severity: 'error',
      from: { path: '^packages/platform' },
      to: { path: '^packages/(?!(kernel|platform))' },
    },
    {
      name: 'ipc-layer-isolated',
      severity: 'error',
      from: { path: '^packages/ipc' },
      to: { path: '^packages/(?!(kernel|platform|ipc))' },
    },
    {
      name: 'credentials-isolated',
      severity: 'error',
      from: { path: '^packages/credentials' },
      to: { path: '^packages/(?!(kernel|platform|credentials))' },
    },
    {
      name: 'observability-isolated',
      severity: 'error',
      from: { path: '^packages/observability' },
      to: { path: '^packages/(?!(kernel|platform|observability))' },
    },
    {
      name: 'agents-interface-isolated',
      comment: '@g4os/agents (contract package) must depend only on kernel',
      severity: 'error',
      from: { path: '^packages/agents' },
      to: { path: '^packages/(?!(kernel|agents))' },
    },
    {
      name: 'auth-isolated',
      comment: '@g4os/auth may depend only on kernel/platform/auth',
      severity: 'error',
      from: { path: '^packages/auth' },
      to: { path: '^packages/(?!(kernel|platform|auth))' },
    },
    {
      name: 'permissions-isolated',
      comment: '@g4os/permissions (tool-use broker + store) depends only on kernel',
      severity: 'error',
      from: { path: '^packages/permissions' },
      to: { path: '^packages/(?!(kernel|permissions))' },
    },
    {
      name: 'session-runtime-layering',
      comment:
        '@g4os/session-runtime depende de kernel/agents/data/ipc/observability/permissions; não pode depender de features/ui/apps nem de pacotes não listados',
      severity: 'error',
      from: { path: '^packages/session-runtime' },
      to: {
        path: '^packages/(?!(kernel|agents|data|ipc|observability|permissions|session-runtime))',
      },
    },

    // ========== FEATURES ==========
    {
      name: 'no-cross-feature-imports',
      comment:
        'Features nao podem importar umas das outras. Exceção: `shell` é horizontal (layout/nav) e pode ser consumido por qualquer feature como pacote de UI compartilhado.',
      severity: 'error',
      from: { path: '^packages/features/src/([^/]+)/' },
      to: {
        path: '^packages/features/src/',
        pathNot: '^packages/features/src/($1|shell)(/|$)',
      },
    },
    {
      name: 'features-cant-import-agents-directly',
      comment: 'Features usam IAgent via ipc, nao implementação direta',
      severity: 'error',
      from: { path: '^packages/features' },
      to: { path: '^packages/agents/(?!interface)' },
    },

    // ========== RENDERER ISOLATION ==========
    {
      name: 'renderer-no-electron',
      comment: 'Renderer nao pode importar electron ou main',
      severity: 'error',
      from: { path: '(src/renderer|apps/desktop/src/renderer)' },
      to: { path: '^(electron|apps/desktop/src/main)' },
    },
    {
      name: 'renderer-no-node-builtins',
      severity: 'error',
      from: { path: '(src/renderer|apps/desktop/src/renderer)' },
      to: { dependencyTypes: ['core'] },
    },

    // ========== VIEWER ISOLATION ==========
    {
      name: 'viewer-no-electron',
      comment: 'Viewer e web, nao pode usar Electron',
      severity: 'error',
      from: { path: '^apps/viewer' },
      to: { path: '^(electron|apps/desktop)' },
    },

    // ========== DEPS DE NPM ==========
    {
      name: 'not-to-deprecated',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['deprecated'] },
    },
    {
      name: 'no-non-package-json-deps',
      comment: 'Dependência deve estar declarada no package.json (exceto em config/test)',
      severity: 'error',
      from: {
        path: '^(src|packages|apps)',
        pathNot: [
          '\\.(test|spec)\\.(ts|tsx)$',
          '/__tests__/',
          '\\.(config|vitest\\.config)\\.(ts|js)$',
        ],
      },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-dev-deps-in-src',
      severity: 'error',
      from: {
        path: '^(src|packages|apps)',
        pathNot: [
          '\\.(test|spec)\\.(ts|tsx)$',
          '/__tests__/',
          '\\.(config|vitest\\.config)\\.(ts|js)$',
          '^apps/[^/]+/scripts/',
        ],
      },
      to: {
        dependencyTypes: ['npm-dev'],
        // electron é devDependency idiomático — binário é embutido pelo
        // electron-builder no pacote final, mas o código-fonte precisa
        // importá-lo diretamente. Sem essa exceção o gate força mover
        // electron para dependencies, o que infla o pacote publicado.
        pathNot: '^node_modules/(.pnpm/)?electron@',
      },
    },

    // ========== CICLOS ==========
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },

    // ========== ÓRFÃOS ==========
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.(ts|cts|mts)$', // TypeScript declaration files
          '(^|/)tsconfig\\.json$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(src|dist)/index\\.(ts|js|d\\.(ts|cts|mts)|cjs)$', // package exports
          'apps/desktop/src/preload\\.ts$', // Electron preload entry point
          'apps/desktop/src/main/index\\.ts$', // Main entry point
          'apps/desktop/src/main/workers/', // utilityProcess / Piscina worker entries
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'],
    },
    exclude: {
      path: '(^|/)(dist|out|build|coverage)/',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: { theme: { graph: { bgcolor: 'transparent' } } },
    },
  },
};
