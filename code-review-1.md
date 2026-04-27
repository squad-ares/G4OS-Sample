# Code Review #1 — Lista de Tarefas

**Data:** 2026-04-26
**Escopo:** `packages/*` + `apps/desktop`
**Método:** 5 agentes paralelos (i18n, qualidade/arquitetura, UI/UX V1↔V2, fluxo first-login, ADR compliance) + verificação manual de cada achado.

---

## Sumário

- **CRITICAL:** 0
- **HIGH:** 6 tarefas (paridade V1)
- **MEDIUM:** 8 tarefas
- **LOW:** 6 tarefas

**Achados descartados após verificação** (alucinações dos agentes — não atuar):
- ~~`Math.random()` no `traceId` de `ipc-context.ts:80`~~ — não existe
- ~~Main process > 6800 LOC (7137/7188)~~ — real é **6236/6800 OK**
- ~~`ThinkingBlock` ausente~~ — existe em [packages/features/src/chat/components/transcript/message-card/thinking-block.tsx](packages/features/src/chat/components/transcript/message-card/thinking-block.tsx)
- ~~Context menu de session/project ausente~~ — existe `SessionContextMenu` em [packages/features/src/sessions/components/session-context-menu.tsx](packages/features/src/sessions/components/session-context-menu.tsx) (mas pode estar não-wired no shell — ver TASK-CR1-13)

---

## HIGH — Paridade V1 e regressões UX

### TASK-CR1-01 · First-login setup flow (auto-onboarding) [L]
**Problema:** V1 tem fluxo automático pós-login que cria workspace, planta skills bundled, e auto-cria session "Workspace Setup" disparando `/setup` skill. V2 só redireciona pra `/workspaces/` (tela em branco para o usuário novo).

**Evidência V1:**
- [apps/electron/src/renderer/App.tsx:929-958](../G4OS/apps/electron/src/renderer/App.tsx) — `handleManagedVerifyOtp` → `continueAfterManagedLogin`
- [apps/electron/src/renderer/App.tsx:1431-1450](../G4OS/apps/electron/src/renderer/App.tsx) — auto-create "Workspace Setup" session quando `setupCompleted=false && totalSessionCount===0`
- [apps/electron/src/main/workspace-onboarding.ts](../G4OS/apps/electron/src/main/workspace-onboarding.ts) — `finalizeWorkspaceOnboarding` cria scaffold + profile + seed + `setupCompleted` flag

**Evidência V2 (gap):**
- [apps/desktop/src/renderer/routes/login.tsx](apps/desktop/src/renderer/routes/login.tsx) — só `setAuthAuthenticated` + redirect para `/workspaces/`
- Sem `setupCompleted` / `styleSetupCompleted` no schema de workspace V2
- Sem `getSetupNeeds()` procedure
- Sem skills bundled (`/setup`, `/onboarding-style-interview`)

**Sub-tarefas:**
- [ ] Adicionar `setupCompleted` + `styleSetupCompleted` ao `Workspace` schema ([packages/kernel/src/schemas/workspace.schema.ts](packages/kernel/src/schemas/workspace.schema.ts))
- [ ] tRPC `workspaces.getSetupNeeds()` retornando `{ needsCredentials, isFullyConfigured }`
- [ ] `finalizeWorkspaceOnboarding(input)` em `@g4os/data/workspaces/onboarding.ts` (port da V1)
- [ ] Wire `OnboardingWizard` na rota pós-login (`/onboarding/`) com gate `isFullyConfigured`
- [ ] Auto-create "Workspace Setup" session disparando skill `/setup`
- [ ] Auto-trigger style interview quando `setupCompleted && !styleSetupCompleted`
- [ ] Plantar bundled skills (`/setup`, `/onboarding-style-interview`, `/project-setup`) ao criar workspace

**Severidade:** HIGH (UX de primeiro acesso quebrada)
**Esforço:** L (1+ dia)
**Bloqueado por:** entender se será replicado 1:1 ou simplificado (decidir antes de começar)

---

### TASK-CR1-02 · Title generation automática de sessions [M]
**Problema:** V1 gera título da session baseado na conversa (~1-2 turns); V2 mantém "New session" indefinidamente.

**Evidência V1:** `apps/electron/src/main/sessions/title-service.ts` — `generateSessionTitle()` chamada após primeiro turn, emite evento `title_generated`.

**Evidência V2 (gap):** Busca por `generateTitle|sessionTitle|titleService` em `apps/desktop/src/main/` + `packages/` retorna 0 ocorrências (excluindo translation keys).

**Fix:**
- [ ] Implementar `TitleGeneratorService` em [apps/desktop/src/main/services/](apps/desktop/src/main/services/) (depende de provider Anthropic/OpenAI)
- [ ] Hook em `TurnDispatcher` após primeira mensagem assistant
- [ ] Emitir `session.titleGenerated` event via `SessionEventBus`
- [ ] Renderer ouve e re-renderiza session-list

**Severidade:** HIGH (lista confusa "New session / New session / New session")
**Esforço:** M (½ dia)

---

### TASK-CR1-03 · Settings sub-sidebar sem ícones e descrições [S]
**Problema:** V1 mostra ícone + label + descrição por categoria; V2 mostra só label.

**Evidência V2:** [packages/features/src/settings/components/settings-panel.tsx:52](packages/features/src/settings/components/settings-panel.tsx#L52) — `<span className="truncate text-[13px] font-medium">{t(cat.labelKey)}</span>`

**Fix:**
- [ ] Adicionar `icon: LucideIcon` + `descriptionKey: TranslationKey` ao schema `SettingsCategory` ([packages/features/src/settings/categories.ts](packages/features/src/settings/categories.ts))
- [ ] Renderizar ícone + label + descrição no `SettingsPanel`
- [ ] Adicionar translation keys de descrição

**Severidade:** HIGH (regressão visual evidente)
**Esforço:** S (≤2h)

---

### TASK-CR1-04 · Sidebar primário "novo chat" no workspace ativo [S]
**Problema:** V1 — primeiro item da sidebar abre novo chat no workspace ativo. V2 — `handleNewSession` em [apps/desktop/src/renderer/routes/_app.tsx](apps/desktop/src/renderer/routes/_app.tsx) cria session e navega.

**Investigar:**
- [ ] V1 inicializa SEM workspace default? (usuário relatou suspeita) — confirmar lendo `apps/electron/src/main/index.ts` boot path
- [ ] Comportamento atual está correto ou há regressão?

**Fix esperado:**
- [ ] Se confirmado regressão: ajustar shell `AppShell` para que clique no item "Sessions" (primeiro) crie session inline em vez de só navegar para list

**Severidade:** HIGH (fluxo de uso primário)
**Esforço:** S (decisão) ou M (refator se necessário)

---

### TASK-CR1-05 · Hover contrast em dark mode [S]
**Problema:** Buttons no composer usam `text-muted-foreground hover:bg-foreground/10 hover:text-foreground` — pode ter conflito de contraste em casos específicos.

**Evidência V2 (todos com mesmo padrão):**
- [packages/features/src/chat/components/composer/voice-button.tsx:73,88](packages/features/src/chat/components/composer/voice-button.tsx)
- [packages/features/src/chat/components/composer/attachments/paperclip-button.tsx:49](packages/features/src/chat/components/composer/attachments/paperclip-button.tsx)
- [packages/features/src/chat/components/transcript/search-bar.tsx:91,100](packages/features/src/chat/components/transcript/search-bar.tsx)

**Fix:**
- [ ] Reproduzir o conflito visualmente em dark mode (`bun run electron:dev` + dark theme)
- [ ] Substituir `hover:bg-foreground/10` por `hover:bg-accent` ou `hover:bg-muted` se confirmado
- [ ] Audit de todos `hover:bg-foreground/X` em packages/features e packages/ui

**Severidade:** HIGH (acessibilidade WCAG + UX)
**Esforço:** S (≤2h)

---

### TASK-CR1-20 · Sessions list (sub-sidebar) — paridade de funcionalidades com V1 [L]
**Problema:** A `SessionList` da V1 tem ~1939 LOC com features ricas; o `SessionsPanel` da V2 tem ~354 LOC e expõe o mínimo (lista plana + 3 tabs + click pra abrir). Várias affordances de power-user e operacional foram perdidas.

**Evidência V1:** [apps/electron/src/renderer/components/app-shell/SessionList.tsx](../G4OS/apps/electron/src/renderer/components/app-shell/SessionList.tsx) (1939 LOC) + [apps/electron/src/renderer/components/app-shell/SessionMenu.tsx](../G4OS/apps/electron/src/renderer/components/app-shell/SessionMenu.tsx)
**Evidência V2:** [packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx](packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx) (354 LOC)

#### Funcionalidades V1 ausentes ou parciais em V2

**Performance e escala:**
- [ ] **Virtualização** com `@tanstack/react-virtual` — V1 usa `useVirtualizer` para listas >80 items. V2 renderiza tudo (regressão de performance em workspaces com 200+ sessions).

**Busca:**
- [ ] **Search inline** com fuzzy matching (`fuzzyScore` de `@g4os/shared/search`) e cap em 100 results
- [ ] **Highlight de matches** dentro do título da session (span com background amarelo)
- [ ] **Search header dedicado** (`SessionSearchHeader` com ícone, clear button, shortcut)
- [ ] **Content search mode** (busca dentro do conteúdo das mensagens, não só título) — requer FTS5 no backend (já existe via ADR-0129)

**Navegação por teclado:**
- [ ] **Roving tabindex** (`useRovingTabIndex`) — Tab entre sessions, Arrow Up/Down navega, Enter abre
- [ ] **Focus zone** (`useFocusZone`) — capture de Esc para sair do search
- [ ] **Escape interrupt** integrado com contexto global de cancelamento

**Multi-select:**
- [ ] **Modo multi-select** (Cmd/Ctrl+Click ativa) — checkbox por session
- [ ] **Bulk actions** sobre sessions selecionadas (archive/delete/label em massa)

**Agrupamento e filtros:**
- [ ] **Date grouping** com locale-aware (`date-fns` + locale do sistema): "Hoje", "Ontem", "Há 2 dias", "Mar 15" — V2 já tem 4 buckets fixos mas sem locale
- [ ] **Filtros secundários** combinados ao tab ativo:
  - Por **label** (com `__all__` que mostra todas com qualquer label)
  - Por **project** (include/exclude por projectId)
  - Por **view** (configurações salvas via `@g4os/shared/views`)
- [ ] **Tabs adicionais** (V1 tem `flagged` além de `recent`/`starred`/`archived`; V2 tem só 3)

**Context menu / Dropdown menu** (right-click + botão `...`):
V2 tem `SessionContextMenu` mas com ações limitadas. V1 expõe:
- [ ] **Compartilhar session** (collaborative — gera link)
- [ ] **Abrir em browser** (collaborative session)
- [ ] **Copiar link** de share
- [ ] **Atualizar** / **Revogar** share
- [ ] **Open Remote Control** (controle remoto via mobile)
- [ ] **Flag / Unflag** (V2 talvez tenha como starred; verificar semântica)
- [ ] **Archive / Unarchive**
- [ ] **Mark unread / Mark read**
- [ ] **Rename** (com dialog dedicado ou inline)
- [ ] **Refresh title** (regenerar via IA — depende de TASK-CR1-02)
- [ ] **Open in new window** (multi-window via `WindowManager`)
- [ ] **Show in Finder** (revelar pasta da session)
- [ ] **Copy path** (copia caminho da session no disco)
- [ ] **Permission mode** (toggle allow-all/ask/deny)
- [ ] **Labels submenu** (apply/remove labels com tree hierarchical)
- [ ] **Delete** (destrutiva, com confirmação)

**UI states:**
- [ ] **Empty state** com CTA quando lista vazia (V2 tem texto simples)
- [ ] **Match count chip** mostrando quantas mensagens da session bateram com a busca atual
- [ ] **chatMatchCount** ao lado do nome quando session selecionada
- [ ] **Permission mode** badge inline (allow-all/ask/deny)
- [ ] **Streaming spinner** vs **unread dot** (V2 já tem `streaming` flag — verificar render)

#### Sub-tarefas sugeridas (em ordem de prioridade)

| # | Subtarefa | Esforço | Bloqueia |
|---|-----------|---------|----------|
| 20a | Virtualização com `@tanstack/react-virtual` | S (≤2h) | — |
| 20b | Search inline com fuzzy + highlight | M (½ dia) | — |
| 20c | Date grouping locale-aware via `date-fns` | S | — |
| 20d | Wire e estender `SessionContextMenu` (verificar TASK-CR1-13) com 15 ações listadas | M (½-1 dia) | TASK-CR1-13 |
| 20e | Roving tabindex + keyboard nav | S | — |
| 20f | Multi-select mode + bulk actions | M | — |
| 20g | Filtros secundários (label/project/view) | M | views feature ainda não tem em V2 |
| 20h | Tab `flagged` (separar de `starred` semanticamente) | S | esclarecer com produto |
| 20i | Empty state com CTA acionável | S | — |
| 20j | Match count chip + chatMatchCount inline | S | depende de FTS search wire |

**Severidade:** HIGH (regressão funcional severa para power users; lista é uma das telas mais usadas)
**Esforço total estimado:** L (1-2 dias) — pode ser feito incrementalmente; sub-tarefas são ortogonais
**Bloqueia / depende de:**
- TASK-CR1-02 (title generation) — para "Refresh title" funcionar
- TASK-CR1-13 (context menu wire audit) — confirmar montagem antes de estender

---

## MEDIUM — Qualidade de código e i18n

### TASK-CR1-06 · Strings hardcoded em catálogos estáticos [S]
**Problema:** 13 strings de UI hardcoded em arquivos não-componente (catálogos exportados). O padrão `labelKey` já existe em outros lugares (ex.: `grouping.ts`, `permissions-presets`).

**Evidência:**
- [packages/features/src/chat/model-catalog.ts:19,28,37,45,53](packages/features/src/chat/model-catalog.ts) — labels de modelos (`'Claude Opus 4.7'`, etc.) — 5 ocorrências
- [packages/features/src/workspaces/types.ts:25-30](packages/features/src/workspaces/types.ts) — labels de cores (mix EN `'Indigo'` + PT `'Esmeralda'`, `'Âmbar'`, etc.) — 6 ocorrências
- [packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx:270-273](packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx) — labels de buckets de data (`'Today'`, `'Yesterday'`) duplicando lógica de `grouping.ts` — 2 ocorrências

**Fix:**
- [ ] `model-catalog.ts`: trocar `label` por `labelKey: TranslationKey`, resolver via `t()` na renderização
- [ ] `workspaces/types.ts`: idem para cores; remover labels PT hardcoded
- [ ] `sessions-panel.tsx`: deletar `resolveBucket()` local e usar a lógica já correta de `grouping.ts`
- [ ] Adicionar translation keys (`chat.models.*`, `workspace.colors.*`, `shell.sessionGroup.*`)

**Severidade:** MEDIUM (i18n parcial — break em produção quando user troca locale)
**Esforço:** S (≤2h)

---

### TASK-CR1-07 · `throw new Error` em vez de `Result` em projects/file-ops [M]
**Problema:** Funções de validação em main lançam `Error` genérico em vez de retornar `Result<T, ValidationError>` (viola ADR-0011).

**Evidência:**
- [apps/desktop/src/main/services/projects/file-ops.ts:86,130](apps/desktop/src/main/services/projects/file-ops.ts) — `throw new Error('path traversal')`, `throw new Error('file too large')`
- [apps/desktop/src/main/services/projects/legacy-import.ts](apps/desktop/src/main/services/projects/legacy-import.ts) — `throw new Error` em fluxos esperados

**Fix:**
- [ ] Refatorar `validatePath`, `enforceSizeLimit`, etc. para retornar `Result<void, ValidationError>` com `code: 'path_traversal' | 'file_too_large'`
- [ ] Caller (ProjectsService) faz `.isErr()` → throw apenas no bridge tRPC

**Severidade:** MEDIUM (parity com ADR-0011; erros não tipados via IPC)
**Esforço:** M (½ dia)

---

### TASK-CR1-08 · Locales pt-br/en-us excedem 500 LOC [S]
**Problema:** [packages/translate/src/locales/pt-br.ts](packages/translate/src/locales/pt-br.ts) (1031 LOC) e [packages/translate/src/locales/en-us.ts](packages/translate/src/locales/en-us.ts) (1022 LOC) excedem o gate de 500 LOC.

**Decisão:** São conteúdo (strings), não código estruturado. Refatorar em N arquivos é overhead sem benefício real.

**Fix:**
- [ ] Adicionar exemption no script `check:file-lines` para `**/locales/*.ts`
- [ ] OU dividir por feature (`auth-locale.ts`, `chat-locale.ts`, etc.) — mais alinhado com BFF, mais boilerplate
- [ ] Documentar decisão em ADR novo se ficar com exemption

**Severidade:** MEDIUM (gate quebra ao próximo PR que tocar tradução)
**Esforço:** S (exemption) ou M (split por feature)

---

### TASK-CR1-09 · Project creation: modal vs page [S]
**Problema:** V1 levava a uma page; V2 abre modal `CreateProjectDialog`. Pode ser melhoria intencional, mas não está documentado em ADR.

**Investigar outras telas com mesmo padrão:**
- [ ] V1 `New session` → page vs V2 modal/inline
- [ ] V1 `New workspace` → page vs V2 page (já é page em V2)
- [ ] V1 `Add source/connection` → ?

**Fix:**
- [ ] Decidir política: modal vs page
- [ ] Documentar em ADR (`docs/adrs/0150-modal-vs-page-for-creation-flows.md`)
- [ ] Aplicar consistência (atual está heterogêneo)

**Severidade:** MEDIUM (inconsistência de UX)
**Esforço:** S (decisão + ADR) ou L (revert se decidir voltar a page)

---

### TASK-CR1-10 · Verificar `runtime-env.ts` tem comment justificando `process.env` [LOW→MEDIUM]
**Problema:** Composition root tem `process.env` reads que devem ter `biome-ignore` documentado.

**Verificar:**
- [ ] [apps/desktop/src/main/runtime-env.ts](apps/desktop/src/main/runtime-env.ts) — confirmar comment `// biome-ignore lint/style/noProcessEnv: ponto único auditável`
- [ ] [packages/kernel/src/validation/env.ts](packages/kernel/src/validation/env.ts) — idem

**Fix:**
- [ ] Adicionar comments faltando

**Severidade:** MEDIUM (gate falha ao próximo upgrade do Biome)
**Esforço:** S (≤30min)

---

### TASK-CR1-11 · Eliminar warnings de `useExhaustiveDependencies` em hooks [S]
**Problema:** Alguns `useEffect`/`useMemo` têm `biome-ignore` de exhaustive deps que poderiam ser estruturalmente corrigidos.

**Evidência:** [packages/features/src/auth/components/reset-confirmation-dialog.tsx:37](packages/features/src/auth/components/reset-confirmation-dialog.tsx) (intencional, ok); buscar outros.

**Fix:**
- [ ] Audit grep `biome-ignore.*useExhaustiveDependencies` em packages
- [ ] Cada caso: refatorar com ref/state ou manter biome-ignore com `(reason: ...)` específico

**Severidade:** MEDIUM (manutenção)
**Esforço:** S (≤2h)

---

### TASK-CR1-12 · `as unknown as any` em electron-trpc bridge [S]
**Problema:** [packages/ipc/src/server/electron-ipc-handler.ts:91,104,150](packages/ipc/src/server/electron-ipc-handler.ts) usa `as unknown as any` (3 ocorrências).

**Causa:** tRPC v11 internal config não exportado.

**Fix:**
- [ ] Confirmar `biome-ignore` com `(reason: tRPC v11 internal config; remover quando electron-trpc atualizar)`
- [ ] Adicionar issue de tracking ao changelog interno

**Severidade:** MEDIUM (justificável mas merece doc)
**Esforço:** S (≤30min)

---

### TASK-CR1-13 · Verificar wire de `SessionContextMenu` no shell ativo [S]
**Problema:** `SessionContextMenu` existe em V2 mas não confirmamos se está montado em todas as listas onde V1 expunha.

**Evidência:**
- [packages/features/src/sessions/components/session-context-menu.tsx](packages/features/src/sessions/components/session-context-menu.tsx) — componente existe
- [packages/features/src/sessions/components/session-list-item.tsx:27](packages/features/src/sessions/components/session-list-item.tsx) — `onContextMenu` é prop, mas será que `SessionsPanel` no shell passa?

**Fix:**
- [ ] Auditar todas as listas: `SessionsPanel`, `ProjectsPanel`, `MarketplacePanel`, `SourcesPanel`
- [ ] Confirmar V1 paridade: ações disponíveis (rename, delete, archive, label, branch, export, share, etc.)
- [ ] Wire `onContextMenu` onde faltar

**Severidade:** MEDIUM (UX power-user)
**Esforço:** S (≤2h verificação) + M se precisar wire

---

## LOW — Cosmético e housekeeping

### TASK-CR1-14 · Refatorar componentes >350 LOC para legibilidade [M]
**Problema:** Alguns componentes ainda dentro do gate (≤500) mas podem ser refatorados para legibilidade.

**Candidatos:**
- [packages/features/src/auth/components/login-card.tsx](packages/features/src/auth/components/login-card.tsx) (439 LOC)
- [packages/features/src/chat/components/composer/composer.tsx](packages/features/src/chat/components/composer/composer.tsx) (414 LOC)
- [packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx](packages/features/src/shell/components/sub-sidebar/sessions-panel.tsx) (354 LOC)

**Fix:**
- [ ] Extrair sub-componentes onde lógica é coesa
- [ ] Não obrigatório enquanto não exceder 500

**Severidade:** LOW
**Esforço:** M (½ dia se feito)

---

### TASK-CR1-15 · ResetConfirmationDialog usa `Math.random` para CAPTCHA [LOW]
**Problema:** [packages/features/src/auth/components/reset-confirmation-dialog.tsx:39-40](packages/features/src/auth/components/reset-confirmation-dialog.tsx) usa `Math.random()` para gerar problema matemático.

**Status:** ACEITÁVEL — é UX anti-acidente, não cripto.

**Fix:**
- [ ] Documentar com `// non-crypto: prevent accidental click only` se Biome reclamar
- [ ] Não migrar para `crypto.getRandomValues` (overkill)

**Severidade:** LOW
**Esforço:** S (≤15min)

---

### TASK-CR1-16 · `ManagedLoginRequiredHub` poderia estender `DisposableBase` [LOW]
**Problema:** Hub em [apps/desktop/src/main/services/managed-login-required-hub.ts](apps/desktop/src/main/services/managed-login-required-hub.ts) tem `Set<handler>` mas não estende DisposableBase. Não há impacto real (usado como singleton no auth-runtime).

**Fix:**
- [ ] Decidir se vale: só se tivermos múltiplas instâncias
- [ ] Atualmente OK como está

**Severidade:** LOW
**Esforço:** S

---

### TASK-CR1-17 · Audit `aria-label` em buttons icon-only [LOW]
**Problema:** Buttons só com ícone precisam de `aria-label` para screen readers. Possíveis omissões.

**Fix:**
- [ ] Grep `<button` sem `aria-label` que tem só `<Icon>` dentro
- [ ] Adicionar `aria-label={t(...)}`

**Severidade:** LOW (a11y)
**Esforço:** S

---

### TASK-CR1-18 · Consolidar `bundled` skills em `@g4os/data/workspaces/seeds.ts` [M]
**Problema:** Skills bundled da V1 ainda não plantadas em V2 (pré-requisito de TASK-CR1-01).

**Fix:**
- [ ] Criar [packages/data/src/workspaces/seeds.ts](packages/data/src/workspaces/seeds.ts)
- [ ] Importar arquivos `.json`/`.md` das skills V1: `/setup`, `/onboarding-style-interview`, `/project-setup`
- [ ] Plantar ao criar workspace via `finalizeWorkspaceOnboarding`

**Severidade:** LOW (depende de TASK-CR1-01 ser priorizada)
**Esforço:** M

---

### TASK-CR1-19 · Centralizar log levels e tracing format [LOW]
**Problema:** `createLogger(scope)` está bem adotado, mas formato de logs varia. Consolidar para troubleshooting.

**Fix:**
- [ ] Documentar contrato em ADR (já temos 0060) — só conferir se está sendo seguido em todos os scopes
- [ ] Padronizar campos: `{ scope, sessionId?, userId?, traceId?, durationMs? }`

**Severidade:** LOW (operacional)
**Esforço:** S

---

## Priorização sugerida (ordem de execução)

1. **TASK-CR1-03** · Settings icons (S, ≤2h) — quick win visual
2. **TASK-CR1-05** · Dark mode contrast (S, ≤2h) — bug visual evidente
3. **TASK-CR1-06** · Strings hardcoded (S, ≤2h) — i18n correctness
4. **TASK-CR1-08** · Locales gate exemption (S) — desbloqueia próximos PRs
5. **TASK-CR1-10** · `runtime-env.ts` comment (S, ≤30min) — barato
6. **TASK-CR1-12** · biome-ignore comment electron-trpc (S, ≤30min) — barato
7. **TASK-CR1-04** · Sidebar new chat (S decisão) — alinhar com V1
8. **TASK-CR1-13** · ContextMenu wire audit (S verificação) — pré-req de TASK-CR1-20d
9. **TASK-CR1-09** · Modal vs page ADR (S decisão) — desbloqueia decisão arquitetural
10. **TASK-CR1-02** · Title generation (M) — UX win grande, pré-req parcial de TASK-CR1-20
11. **TASK-CR1-07** · Result em file-ops (M) — ADR compliance
12. **TASK-CR1-20** · Sessions list paridade V1 (L, sub-tarefas ortogonais) — épico de UX
13. **TASK-CR1-01** · First-login setup flow (L, depende de seeds CR1-18) — épico maior
14. **TASK-CR1-18** · Seeds bundled (M) — pré-req do CR1-01
15. **TASK-CR1-11** · useExhaustiveDependencies audit (S) — manutenção
16. **TASK-CR1-14** · Refator componentes >350 (M) — opcional
17. **TASK-CR1-15** · CAPTCHA comment (S) — opcional
18. **TASK-CR1-16** · Hub disposable (LOW) — sem urgência
19. **TASK-CR1-17** · aria-label audit (S) — a11y
20. **TASK-CR1-19** · Log format (S) — operacional

**Total estimado:** ~3 dias de S/M + ~3-4 dias das épicas L (CR1-01, CR1-20). TASK-CR1-20 sub-tarefas (a-j) podem ser feitas independentemente em sprints curtos.

---

## Notas finais

- **Tudo dentro do budget de gates atuais:** main 6236/6800 LOC, file-lines 0 violations (exceto locales — TASK-CR1-08).
- **Padrão Result + Disposable bem adotado:** 261 ocorrências de `.isErr()` em packages, todos os services com timer/listener estendem `DisposableBase`.
- **ADRs respeitados em ~93%:** apenas ADR-0011 (parcial em projects/file-ops) e ADR-0031 (locales acima do limite, mas defensável).
- **Próximo passo recomendado:** rodar TASK-CR1-03/05/06/08/10/12 num único PR (todas S, ≤2h cada, ortogonais) e depois atacar TASK-CR1-02 e CR1-01 separadamente.
