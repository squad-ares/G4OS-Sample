---
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/translate': patch
---

Round 2 de paridade de UI com a V1, focada em densidade de informação e
chrome do chat. Treze itens fechados em um só ciclo:

**Tela inicial pós-login** — `WorkspaceLandingCanvas` reescrito no estilo
V1: dotted background pattern, brand mark institucional G4 OS, eyebrow
uppercase tracking, hero card com `Sparkles` CTA e `ArrowRight`
secundário, recent-session chip, grid 2-col com `ReadyPanel` (chips de
stats: projetos / recentes / sources) + `ActiveWorkspacePanel`. Markup
extraído pra `packages/features/src/workspaces/components/` para que o
route fique como thin client.

**Chat — transcript treatment** — User bubble agora tem largura cap
contextual (`sm:max-w-[30rem] lg:max-w-[34rem]`) ao invés de 80% da
viewport (texto longo ficava ilegível em monitor wide). Transcript
ganha `mask-image` gradient top/bottom de 32px e brand-mark sutil
"G4 OS" no rodapé quando há mensagens.

**Chat — streaming cursor** — Cursor pulsante (`animate-pulse`) agora
aparece em todo turno em streaming, não só quando content está vazio.
Anteriormente o cursor sumia assim que o primeiro `text_delta` chegava,
o que escondia o feedback visual de que a resposta ainda estava sendo
gerada.

**Project card** — Adicionado status pill (`Ativo` / `Arquivado` com
cores semânticas) + relative-time stamp (`Atualizado 2h`). Empty state
do `ProjectList` reescrito com icon `FolderKanban` em container
arredondado + título + descrição + dual CTA (`Sparkles Criar primeiro
projeto` / `FolderOpen Importar pasta existente`).

**Sub-sidebar — ProjectsPanel** — Items agora têm 2 linhas: nome +
ícones de status (Archive quando arquivado) na linha superior, e
subtitle (`description` truncada ou `Sem descrição` italic) na inferior.
Closes uma info-density gap visível.

**Sub-sidebar — SessionsPanel** — Row ganha `Loader2` spinner para
sessão com turn ativo (substitui o unread dot quando `streaming`),
chip de project linkado (`FolderKanban` + nome) na linha de metadata.

**Sub-sidebar — 3 panels novos** — `SourcesPanel`, `MarketplacePanel` e
`AutomationsPanel` substituem o `PlaceholderPanel` genérico para
`/connections`, `/marketplace` e `/automations`. SourcesPanel mostra
sources habilitadas vs. desabilitadas com kind icon (Server/Cloud/Plug/
FolderOpen/Database) e status indicator (CheckCircle2 verde para
connected, AlertCircle vermelho para error). MarketplacePanel separa
installed vs. featured com adapter best-effort para o payload genérico
do router atual. AutomationsPanel é placeholder estilizado com empty
state (workflow/schedule/watcher/agent kinds preparados pra dados
futuros).

**Chat — active-options badges** — Nova linha de chips abaixo do
`SessionHeader` mostrando estado da sessão sem ocupar o transcript:
`Cpu` chip com provider+model, `FolderOpen` chip com basename do
working dir, `Plug` chip com contagem de sources ativas (e sticky se
diferente). Cada chip é clicável e pode abrir o picker correspondente.

**Chat — right-sidebar metadata panel** — `SessionMetadataPanel`
toggle pelo `PanelRight` icon button no `SessionHeader`. Mostra: nome
editável inline (Enter/Escape), project picker (com lista expandível
de projetos disponíveis e navegação para o projeto), working-dir field
clicável, notes textarea livre. 320px wide, slide-in com border-l.

**Chat — banners empilháveis** — `SessionBanners` componente que aceita
um array de banners (info / warning / error / permission severities)
com ícones por severity, ações primárias e dismiss opcional. Helpers
`buildRuntimePendingBanner`, `buildPermissionPendingBanner`,
`buildErrorBanner`, `buildContextWarningBanner`, `buildStatusBanner`
para padronizar construção. Banner único de runtime pending agora
passa por essa pipeline.

**Workspace list — stats metadata** — `WorkspaceListPanel` aceita
`stats` Map opcional com `sessionCount` / `projectCount` /
`lastActivityAt` por workspace ID. Cada item renderiza uma linha
extra com `MessagesSquare` icon e formato `5 sessões · 2 projetos ·
Ativo há 3h`. Active workspace ganha pill `Ativo` ao lado do nome.
Route `/workspaces` agora usa `useQueries` para fetchar
sessions+projects de todos os workspaces em paralelo.

**Refactors para gates** — Extraído `useSessionMetadata` hook (linked
project + available projects + selectProject + banner stack) para
manter o route file abaixo do cap 500 LOC. Switch statement no
`renderSubSidebarPanel` substitui if-chain. 6 sub-renderers
(`renderSessionsPanel`, `renderProjectsPanel`, etc.) tornam o
dispatch table mais claro.

50+ chaves novas em pt-BR e en-US: `chat.header.toggleMetadata`,
`chat.metadata.*` (10), `chat.transcript.brandFooter`,
`chat.banners.dismiss`, `project.card.status.*`,
`project.card.updatedRelative`, `project.list.emptyTitle/Description/
importLegacy`, `shell.subsidebar.projects.archived/noDescription`,
`shell.subsidebar.sources.*` (5), `shell.subsidebar.marketplace.*` (6),
`shell.subsidebar.automations.*` (4), `workspace.landing.stats.sources`,
`workspace.landing.active.label/empty`, `workspace.list.activeBadge`,
`workspace.list.stats.*` (3).

Bump `@g4os/desktop` para 0.0.8-beta.
