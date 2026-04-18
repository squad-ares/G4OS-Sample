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

    // ========== FEATURES ==========
    {
      name: 'no-cross-feature-imports',
      comment: 'Features nao podem importar umas das outras',
      severity: 'error',
      from: { path: '^packages/features/([^/]+)' },
      to: {
        path: '^packages/features/',
        pathNot: '^packages/features/$1',
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
        ],
      },
      to: { dependencyTypes: ['npm-dev'] },
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
          '\\.d\\.(ts|cts|mts)$',  // TypeScript declaration files
          '(^|/)tsconfig\\.json$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(src|dist)/index\\.(ts|js|d\\.(ts|cts|mts)|cjs)$',  // package exports
          'apps/desktop/src/preload\\.ts$',  // Electron preload entry point
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