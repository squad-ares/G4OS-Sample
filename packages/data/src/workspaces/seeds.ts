/**
 * Skills bundled plantadas em todo workspace recém-criado.
 *
 * MVP: cada skill é um par `{ slug, frontmatter, body }` que vira um
 * arquivo markdown em `<workspaceRoot>/skills/<slug>/SKILL.md`. O runtime
 * de skills (resolve frontmatter, executa via session) é épico separado;
 * aqui só plantamos os artefatos para que `getSetupNeeds` + auto-onboarding
 * (TASK-CR1-01) tenham conteúdo coerente disponível.
 *
 * Conteúdo derivado das skills V1 (`apps/electron/resources/default-workspace/skills/`)
 * com adaptação ao tom e arquitetura V2.
 */

export interface BundledSkill {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

const WORKSPACE_SETUP: BundledSkill = {
  slug: 'workspace-setup',
  name: 'Workspace Setup',
  description:
    'Onboarding guiado — entrevista para entender objetivos, rotina e integrações desejadas no workspace.',
  body: `# Workspace Setup

Use esta skill quando:
- user invoca \`/setup\`
- primeira session de um workspace novo auto-dispara o setup
- user pede para configurar onboarding/workspace do zero

## Identidade

Durante este onboarding, refira-se a si próprio como **G4 OS**.

## Fluxo

Rode as fases em ordem. Pergunte uma coisa por vez e espere a resposta. Se algum
detalhe já estiver registrado em \`context/workspace-context.md\` ou no bloco
\`G4OS:ONBOARDING\`, trate como autoritativo e pule a pergunta correspondente.

1. **Identidade & papel** — nome preferido do user, função, contexto de empresa
2. **Objetivos** — o que o user pretende alcançar nas próximas semanas
3. **Rotina** — frequência de uso esperada, horários de pico, dispositivos
4. **Integrações** — Gmail, Slack, GitHub, Linear, Drive, Notion etc. (sugira sources baseado na função)
5. **Working directory** — onde files/projects vivem; ofereça \`workspaceRoot/main\` como default
6. **Próximos passos** — sugira primeira project/automation concreta

## Saída

Ao concluir, escreva resumo em \`context/workspace-context.md\` e atualize:
- \`workspace.defaults.workingDirectory\`
- \`workspace.defaults.permissionMode\`
- \`workspace.setupCompleted\` → \`true\`

Avise o user que ele pode marcar o setup como concluído nas configurações se
preferir revisar primeiro.
`,
};

const ONBOARDING_STYLE_INTERVIEW: BundledSkill = {
  slug: 'onboarding-style-interview',
  name: 'Onboarding — Entrevista de Estilo',
  description:
    'Coleta preferências de tom, formato de resposta e nível de detalhe esperado para personalizar o assistente.',
  body: `# Onboarding — Entrevista de Estilo

Use esta skill quando:
- user invoca \`/onboarding-style-interview\`
- workspace tem \`setupCompleted=true\` mas \`styleSetupCompleted=false\`

## Objetivo

Capturar 5-7 dimensões de estilo para ajustar respostas futuras:

1. **Tom** — formal, casual, técnico, didático
2. **Tamanho de resposta padrão** — curto/objetivo, médio explicado, longo detalhado
3. **Idioma preferido** — pt-BR, en-US, mistos
4. **Formato** — markdown, prose, tabelas, listas
5. **Comentários em código** — densos, esparsos, didáticos, mínimos
6. **Citações de fontes** — sempre, só quando solicitado, nunca
7. **Próxima ação sugerida** — o user gosta de receber sugestões proativas?

## Saída

Atualize \`context/workspace-context.md\` com seção \`## Style preferences\`.
Marque \`workspace.styleSetupCompleted=true\` ao final.
`,
};

const PROJECT_SETUP: BundledSkill = {
  slug: 'project-setup',
  name: 'Project Setup',
  description: 'Bootstrap de novo projeto com scaffolding inteligente baseado no objetivo.',
  body: `# Project Setup

Use esta skill quando:
- user cria um novo project (entrypoint manual ou via workspace setup)
- user invoca \`/project-setup <nome>\`

## Fluxo

1. Pergunte objetivo do project em 1 frase
2. Sugira estrutura de \`files/\` baseado no objetivo (docs, código, dados, etc.)
3. Crie esboço inicial em \`files/README.md\`
4. Crie \`files/AGENTS.md\` apontando pra \`workspace-context.md\` para contexto compartilhado
5. Sugira 3-5 tasks iniciais no \`task-board\` do project
6. Sugira sources relevantes para o objetivo (e quais já estão habilitadas)

## Saída

Project com \`README.md\`, \`AGENTS.md\`, e algumas tasks no board.
\`projects.update\` para marcar setup pronto.
`,
};

export const BUNDLED_SKILLS: readonly BundledSkill[] = [
  WORKSPACE_SETUP,
  ONBOARDING_STYLE_INTERVIEW,
  PROJECT_SETUP,
];

/**
 * Renderiza uma skill como markdown com frontmatter YAML para gravar em
 * `<workspaceRoot>/skills/<slug>/SKILL.md`.
 */
export function renderBundledSkill(skill: BundledSkill): string {
  const escapedDescription = skill.description.replace(/"/g, '\\"');
  return `---\nname: "${skill.name}"\ndescription: "${escapedDescription}"\n---\n\n${skill.body}`;
}
