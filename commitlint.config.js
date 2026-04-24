/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // nova feature
        'fix', // bug fix
        'perf', // melhoria de performance
        'refactor', // refatoração sem mudança de comportamento
        'docs', // apenas documentação
        'style', // formatação, sem mudança de código
        'test', // adição/correção de testes
        'build', // mudança em build system, deps
        'ci', // CI/CD
        'chore', // manutenção geral
        'revert', // reverter commit
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        // Foundation
        'foundation',
        // Por pacote
        'kernel',
        'platform',
        'ipc',
        'credentials',
        'ui',
        'agents',
        'sources',
        'features',
        'data',
        'observability',
        'permissions',
        'session-runtime',
        // Features
        'chat',
        'sessions',
        'workspaces',
        'projects',
        'marketplace',
        'company-context',
        'scheduler',
        'vigia',
        'remote-control',
        'voice',
        'skills',
        'browser',
        // Apps
        'desktop',
        'viewer',
        // Infra
        'deps',
        'ci',
        'build',
        'release',
        'docs',
        'config',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', ['sentence-case', 'lower-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};
