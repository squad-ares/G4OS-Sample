---
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/translate': patch
'@g4os/ui': patch
---

Round 3 de paridade V1↔V2 + honestidade da UI das configurações + dois ADRs estruturais novos. Trabalho consolidado de múltiplas waves.

**Chat header — chrome leve** (ADR-0156). `SessionHeader` (bar dedicada com nome editável + 4 botões + 3 badges) deletado. Em V1 o canvas de chat é máximo, sem chrome competindo com `SessionsShellTopBar`. `SessionActiveBadges` foi expandido para acomodar os 2 ações úteis (`onRetryLast` + `onToggleMetadata`) no fim da chip line. Rename + archive moveram para `SessionMetadataPanel` (drawer lateral). Net: −190 LOC mortos, +30 LOC em badges, +30 LOC em metadata panel.

**Chat title bar restaurado** (`SessionTitleBar`). Após feedback que rename direto via título do chat era affordance valiosa do V1, criamos um strip novo, dedicado e leve (apenas o nome com click-to-edit inline, sem botões — esses ficam na chip line e no metadata panel). Strip vive acima de `SessionActiveBadges`. Trade-off: 2 rows finos > 1 row pesado (V1 tinha 1 row mais alto; aceitamos a divisão pra manter cada componente focado).

**Onboarding agora pede credenciais** antes do primeiro send. Wizard ganhou step novo `credentials` entre `agent-selection` e `ready`: pede `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` conforme o agente escolhido, salva via `trpc.credentials.set`. Sem isso o usuário V2 caía no chat sem nenhuma credencial e a primeira mensagem falhava silenciosamente.

**Workspace creation = fullscreen splash overlay** (ADR-0157). Rota `/workspaces/new` antes era card inline dentro do shell `_app` (sub-sidebar e top bar visíveis competindo com o wizard). Agora é overlay `fixed inset-0 z-[100]` com `brand-dotted-bg` + drag region + close button, paridade direta com V1 `WorkspaceCreationScreen.tsx`. Auth guard preservado pelo layout `_app` por trás. Mesmo pattern aplicado a `/projects/new`.

**Project creation: modal → page**. `CreateProjectDialog` (modal) refatorado: form interno extraído pra `CreateProjectForm` reusable. Nova rota `/projects/new` com fullscreen overlay segue ADR-0150 (page para creation flows com side effects pesados) + ADR-0157 (overlay como tratamento canônico). `ProjectList` ganhou prop `onNavigateToCreate` — quando provida, button "Novo" navega; senão mantém modal legacy. Conversation-led setup (V1 real) documentado como follow-up `TASK-V2-PROJECTS-CONVERSATIONAL`.

**Workspace landing brand mark restaurado**. `WorkspaceLandingCanvas.brandMark` mudou de `string` para `ReactNode`. Route passa `<G4OSSymbol className="h-8 w-8" />` (port da V1 com `currentColor` no fill). Novo componente `G4OSSymbol` exportado de `@g4os/ui`.

**Projects list header full-width 2-col**. Per `apps/electron/CLAUDE.md` guideline: search em row separada + `Importar`/`Novo` em grid 2-col compartilhando largura. Antes ambos botões ficavam à direita junto do title.

**Settings honestidade pass.**
- `usage` e `cloud-sync` reclassificados de `status: 'ready'` para `'planned'` — sidebar agora mostra badge "Em breve" antes do clique. Antes mentiam: claim era ready, UI mostrava 3 painéis "Em breve" (stub).
- 3 phantom panels deletados (appearance density, repair destructive, app diagnostics) — eram blocos `tone="warning"` com texto "Em breve" sem nenhuma feature por trás.
- 8 translation keys orphan removidas (`settings.{app.diagnostics,appearance.density,repair.destructive}.*`).
- Honesty gate em `__tests__/categories.test.ts` valida split: flipar `usage`/`cloud-sync` para `ready` sem implementar quebra o test.

**Support category nova** (13ª categoria, status `ready`). Hub estático com fingerprint copiável (versão + platform + electron + node) + links externos para docs / GitHub issues / email. Wirado em `trpc.platform.{getAppInfo, copyToClipboard, openExternal}`. V1 tinha 897 LOC com help hub; V2 mantém slice mínimo até decisão sobre help-center embarcado.

**Backup category nova** (14ª categoria, status `ready`). `BackupScheduler` rodava 24h em background mas não tinha UI — usuário não conseguia listar, disparar manualmente ou apagar backups. Agora: novo `BackupService` IPC (`list` / `runNow` / `delete`), router em `@g4os/ipc`, implementação real em `apps/desktop/src/main/services/backup-service.ts` que compõe o scheduler existente. UI lista todos os ZIPs em `<data>/auto-backups/` agrupados por workspace (mais recente primeiro), permite "Run now" por workspace, "Show in folder" via `platform.showItemInFolder` e delete com confirmação. `BackupScheduler` ganhou método público `runForWorkspace(id)` + getter `backupDir`. Restore deferido como follow-up — destrutivo, merece UX dedicada.

**Hard reset** (settings/repair). Botão dev-friendly que dispara `trpc.auth.wipeAndReset` (já existia no main process via `perform-wipe.ts`): apaga workspaces + credenciais + relança app pra login limpo. Confirmação via `ConfirmDestructiveDialog`. Útil quando login está corrompido ou cache em estado ruim.

**Dialog backdrop melhorado**. Overlay mudou de `bg-black/50` para `bg-black/65 backdrop-blur-sm`. Modal agora destaca claramente do fundo — antes parecia "fundido" com o conteúdo atrás. Aplica a todos os modais via `Dialog` (CreateProjectDialog, ConfirmDestructiveDialog, etc.).

**ADRs novos**:
- ADR-0156: Chat canvas chrome — sem SessionHeader.
- ADR-0157: Creation wizards renderizados como fullscreen splash overlay.

Ambos accepted no mesmo dia da implementação. Índice em `docs/adrs/README.md` atualizado para incluir 0145–0157 (estava parado em 0144).

**Docs novos**:
- `Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md` — audit V1↔V2 com priorização P0/P1/P2.
- `Docs/STUDY/code-review/code-review-16.md` — multi-agent CR pré-canary.
- `Docs/STUDY/code-review/v2-settings-followups.md` — TASKs documentadas para AI Settings, Cloud Sync MVP, Usage MVP, Conversational Project Setup.
