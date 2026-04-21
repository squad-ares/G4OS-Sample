/**
 * Corpus de fixtures que representam formatos ricos produzidos pela V1
 * (anonimizados). Cobre o surface area exigido em TASK-11-00-11: tabelas,
 * listas, code fences completos/incompletos, custom blocks (`partnercards`)
 * e resultado de tool. A V2 tem que continuar renderizando ou degradar
 * graciosamente cada um deles.
 */

export interface MarkdownFixture {
  readonly id: string;
  readonly description: string;
  readonly content: string;
  readonly isStreaming?: boolean;
}

export const MARKDOWN_FIXTURES: readonly MarkdownFixture[] = [
  {
    id: 'plain-prose',
    description: 'Títulos, negrito, itálico e link — prosa direta',
    content: [
      '# Relatório semanal',
      '',
      'Resumo **curto** do que *andou* acontecendo. Ver [painel](https://example.internal/panel).',
      '',
      'Próximos passos abaixo.',
    ].join('\n'),
  },
  {
    id: 'gfm-table',
    description: 'Tabela GFM com alinhamentos',
    content: [
      '| Módulo      | Cobertura | Status   |',
      '| :---------- | --------: | :------: |',
      '| ingest      | 92%       | verde    |',
      '| transform   | 78%       | amarelo  |',
      '| export      | 64%       | vermelho |',
    ].join('\n'),
  },
  {
    id: 'nested-lists',
    description: 'Lista aninhada com ordenada dentro de bullet',
    content: [
      '- Backend',
      '  1. Fechar auth OTP',
      '  2. Migrar event store',
      '- Frontend',
      '  - Atualizar composer',
      '  - Revisar transcript',
    ].join('\n'),
  },
  {
    id: 'code-fence-closed',
    description: 'Code fence completo com linguagem declarada',
    content: ['```ts', 'const x: number = 1;', "console.log('ok');", '```'].join('\n'),
  },
  {
    id: 'code-fence-incomplete-streaming',
    description: 'Streaming: code fence aberto sem fechamento — deve ser saneado',
    content: ['Aqui está a função:', '', '```python', 'def soma(a, b):', '    return a + b'].join(
      '\n',
    ),
    isStreaming: true,
  },
  {
    id: 'inline-code',
    description: 'Inline code + parágrafo comum',
    content: 'Rode `pnpm check:cruiser` para validar boundaries.',
  },
  {
    id: 'partnercards-unregistered',
    description:
      'Custom block `partnercards` sem renderer registrado — deve cair no CodeBlock genérico como fallback seguro',
    content: [
      '```partnercards',
      '[{"title":"Parceiro A","slug":"parceiro-a"},{"title":"Parceiro B","slug":"parceiro-b"}]',
      '```',
    ].join('\n'),
  },
  {
    id: 'mixed-rich-content',
    description: 'Parágrafo + tabela + lista + code fence no mesmo bloco',
    content: [
      '## Ajustes',
      '',
      '| Squad | Entregou | Pendente |',
      '| ----- | -------- | -------- |',
      '| Ares  | 3        | 1        |',
      '| Zeus  | 5        | 0        |',
      '',
      '- Ajustar retry logic',
      '- Publicar changelog',
      '',
      '```bash',
      'pnpm typecheck',
      'pnpm lint',
      '```',
    ].join('\n'),
  },
  {
    id: 'raw-html',
    description: 'Raw HTML inline permitido via rehype-raw',
    content: ['Alerta: <strong>produção</strong> está em janela de deploy.'].join('\n'),
  },
];

export interface ToolResultFixture {
  readonly id: string;
  readonly description: string;
  readonly toolName: string;
  readonly result: unknown;
}

export const TOOL_RESULT_FIXTURES: readonly ToolResultFixture[] = [
  {
    id: 'tool-result-string',
    description: 'Tool result string simples',
    toolName: 'custom_tool',
    result: 'Processed 42 rows',
  },
  {
    id: 'tool-result-json',
    description: 'Tool result JSON estruturado',
    toolName: 'custom_tool',
    result: { count: 12, items: ['a', 'b', 'c'] },
  },
  {
    id: 'tool-result-error',
    description: 'Tool result com shape de erro',
    toolName: 'custom_tool',
    result: { error: 'Permission denied', code: 'EACCES' },
  },
];
