---
'@g4os/features': patch
---

Code Review 37 — packages/features — 22 findings (1 CRITICAL + 9 HIGH + 9 MEDIUM + 3 LOW).

Auditoria exaustiva de `packages/features` (172 arquivos) cobrindo: hardcoded strings (ADR-0109), memory leaks/race conditions (ADR-0012), ADR contradictions (CR-30 regressions), boundary violations (ADR-0152), parity gaps com V1, accessibility (ADR-0110), tests coverage. Imports estão limpos (`@g4os/kernel`, `@g4os/translate`, `@g4os/ui`, `@g4os/ipc` only). Nenhum `as any`/`@ts-ignore`/`console.*` em src. App.tsx LOC compliance OK (largest 438 LOC em `auth/components/login-card.tsx`). Test coverage extremamente baixo (3 arquivos de teste para 172 sources).

**F-CR37-1 — `ThinkingLevel` divergente em workspace setup wizard (CRITICAL — REGRESSÃO CR-30 F-CR30-2).**
`packages/features/src/workspaces/types.ts:15-17` declara `export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'` e `DEFAULT_THINKING_LEVEL: 'medium'`. Idêntico ao enum legacy que CR-30 F-CR30-2 explicitamente eliminou em `chat/model-catalog.ts`. `setup-wizard.tsx:43` instancia draft com `thinkingLevel: 'medium'`; `defaults-step.tsx:66-69` oferece picker `minimal/low/medium/high`. Kernel `ThinkingLevelSchema = z.enum(['low', 'think', 'high', 'ultra'])` (`packages/kernel/src/schemas/session.schema.ts:37`). Quando user escolhe `medium` no onboarding, valor é persistido em workspace defaults, propagado para `session.metadata.thinkingLevel`, e o `level-resolver.ts` mapeia para `none` (mesmo bug que CR-30 fixou na UI do composer). Fix: importar `ThinkingLevel` de `@g4os/kernel/types`, atualizar default para `'think'`, picker oferecer 4 levels válidos. ADR-0117 / CR-30.

**F-CR37-2 — Erros de attachment hardcoded em inglês (HIGH).**
`chat/components/composer/attachments/validate-attachment.ts:12,16,22` retornam strings `'Maximum N files allowed.'`, `'"name" exceeds the 20 MB limit.'`, `'Total attachment size exceeds 40 MB.'` — ZERO uso de `t()`. Mensagens são renderizadas via `setAttachError → <p>{attachError}</p>` em `composer.tsx:200`. Em locale pt-BR, user vê inglês cru. Fix: retornar discriminated union `{ code: 'too-many-files' | 'file-too-large' | 'total-too-large', params }` e `composer.tsx` traduz via `t()`. ADR-0109.

**F-CR37-3 — `ThinkingBlock` strings hardcoded (HIGH).**
`chat/components/transcript/message-card/thinking-block.tsx:23` renderiza literalmente `'Thinking…'` ou `'Thought process'` no JSX. Componente principal de UI durante streaming. Fix: `useTranslate` + `t('chat.thinkingBlock.streaming')` / `t('chat.thinkingBlock.label')`. ADR-0109.

**F-CR37-4 — Helpers `formatRelative` duplicados, hardcoded e inconsistentes (HIGH).**
Três sites independentes implementam time-ago format com strings hardcoded: `shell/components/sub-sidebar/sessions-panel.tsx:393-407` (`'now'` em inglês + `${m}m`/`${h}h`/`${d}d`), `projects/components/project-card.tsx:118-133` (`'agora'` em pt — inconsistente com sessions-panel), `workspaces/components/workspace-list-panel.tsx:222-233` (`'agora'`). `sessions/components/session-list-item.tsx:77-89` JÁ USA `t('session.list.relative.justNow')` corretamente — esse é o pattern. Fix: extrair helper em `@g4os/features/shared/format-relative.ts` ou reusar via translate keys novas. Locale-aware via `formatDate`/`formatRelativeTime` de `@g4os/translate`. ADR-0109.

**F-CR37-5 — `toLocaleDateString(undefined, ...)` ignora locale do app (HIGH).**
11 sites usam `new Date(...).toLocaleDateString(undefined, ...)` (`undefined` = locale default da JS engine, não do app): `settings/components/backup-category.tsx:194,207`; `chat/components/transcript/separators/date-separator.tsx:14`; `shell/components/sub-sidebar/sessions-panel.tsx:403`; `shell/components/sub-sidebar/sessions-panel-grouping.ts:71`; `projects/components/project-card.tsx:129`; `workspaces/components/workspace-list-panel.tsx:232`; `sessions/components/global-search.tsx:71`; `sessions/components/session-list-item.tsx:88`; `news/components/news-panel.tsx:109`; `news/components/news-detail.tsx:38`. Em macOS pt-BR mas locale do app `en-US`, datas saem em pt-BR — UI fica multilingue. `@g4os/translate` exporta `formatDate(locale, value, options)` exatamente para isso. Fix: usar `formatDate(currentLocale, ...)` ou expor helper via `useTranslate()`. ADR-0109.

**F-CR37-6 — Cooldown extraction regex em inglês only (HIGH).**
`auth/hooks/use-login-controller.ts:181-184` `extractRetryAfterSeconds(msg)` regex `/after\s+(\d+)\s+seconds?/i` casa apenas mensagem em inglês ("Please try again after 30 seconds"). Se Supabase localizar a mensagem, cooldown não é detectado e botão Resend fica habilitado mesmo com rate limit ativo — user clica e refaz request 429. Fix: backend retorna `retryAfter: number` via `error.retryAfter` ou usa header HTTP `Retry-After`; ou mantém regex multi-locale com fallback. ADR-0109/parity.

**F-CR37-7 — Permission provider state-during-render + bridge nunca limpo (HIGH).**
`chat/permissions/permission-provider.tsx:77-79` muta `activeBridge` (variável module-level) DURANTE o render: `if (activeBridge !== enqueue) activeBridge = enqueue;`. React 19 strict mode roda render duas vezes; multi-window monta dois Providers que sobrescrevem `activeBridge` competindo. Comentário linhas 74-76 reconhece "não ideal, mas é fallback intencional" — porém `activeBridge` não é zerado em unmount, então ficam Promises que rejeitam contra Provider já desmontado. Linhas 40,57 usam `throw new Error(...)`/`Promise.reject(new Error(...))` com strings em pt-BR hardcoded. Fix: `useEffect(() => { activeBridge = enqueue; return () => { if (activeBridge === enqueue) activeBridge = null; }; }, [enqueue])`; mensagens via translate. ADR-0116.

**F-CR37-8 — `useStreamingText` perde head do stream em tab oculta (HIGH).**
`chat/hooks/use-streaming-text.ts:60-65` quando buffer ultrapassa `MAX_BUFFER_SIZE` (512KB), faz `bufferRef.current.slice(-MAX_BUFFER_SIZE)` — descarta o INÍCIO do que ainda não foi drenado. Comentário "preserva contexto recente" assume que head já foi mostrado, mas se rAF nunca disparou (tab hidden desde o turn-start), head NUNCA chegou ao state `text`. User volta à tab e vê resposta truncada do meio. Fix: ao exceder cap, fazer `setText(prev => prev + bufferRef.current); bufferRef.current = ''` (drain forçado) em vez de slice. ADR-0112.

**F-CR37-9 — Acumulação infinita em árvores cíclicas (label-tree, branch-tree) (HIGH).**
`sessions/logic/label-tree.ts:36-46` `flattenLabels` recursivo sem cycle guard. Se DB retornar dois labels com `parentId` apontando um ao outro (corrupção / falha do materialized-path), `flattenLabels` recurses infinitamente → stack overflow / aba freeze. Mesma issue em `sessions/components/branch-tree.tsx:82-87` `buildTree`. ADR-0127 garante DB-level cycle-free, mas ADR-0011 sugere defensive front-end. Fix: passar `Set<id>` visitado, retornar early se já visto. ADR-0127/0128.

**F-CR37-10 — Tool renderer registry não-idempotente (MEDIUM).**
`chat/tool-renderers/registry.tsx:14-22` exporta module-level `renderers: ToolRenderer[]` com `push` em `registerToolRenderer`. Sem checagem de duplicata, sem unregister, sem clear. `bash-renderer.tsx`/`read-file-renderer.tsx`/`search-results-renderer.tsx` registram via side-effect import. HMR ou múltiplas importações duplicam entries — `resolveToolRenderer` first-match-wins, mas em testes (vitest) o array persiste entre arquivos de teste. Fix: usar `Map<string, ToolRenderer>` com check de duplicata (lança ou no-op + warn) + `clearRegistryForTests()` exposto. ADR-0113.

**F-CR37-11 — `useSearchMatches` sem AbortController (MEDIUM).**
`chat/hooks/use-search-matches.ts:29-44` `runSearch` chama `search(q)` sem AbortSignal. Em backend FTS5 local custo é baixo, mas em semantic search via HTTP (planejado), queries lentas continuam executando depois de query change/unmount. `latestQueryRef` guard só previne setState, não a request. Race: stale promise com `q === latestQueryRef.current` resolve ANTES da promise atual → `setIsSearching(false)` flips spinner durante busca ainda em voo. `search()` lançando exception nunca chega ao `finally` correto se for em-flight quando query muda. Fix: AbortController per-call + `finally` reset condicional. ADR-0119.

**F-CR37-12 — `use-voice-recorder` swallowing errors silenciosamente (MEDIUM).**
`chat/hooks/use-voice-recorder.ts:55-58` `getUserMedia` falha (user nega permissão) → `catch { return; }` — zero feedback ao user. User clica botão mic, nada acontece. `voice-button.tsx:30` `transcribe()` pode rejeitar (network, API key inválida) sem try/catch — falha silenciosa. Promise de `stop()` retornando `Promise<Blob>` via `resolveRef.current?.(blob)` pode ficar non-resolving se cancel limpar `resolveRef` antes do `onstop`. Fix: hook retorna `{ error: VoiceError | null }`; component renderiza system message ou toast. ADR-0118.

**F-CR37-13 — `use-composer-state` race em sessionId change (MEDIUM).**
`chat/hooks/use-composer-state.ts:41-53` save effect tem `text`, `sessionId` em deps. Quando `sessionId` muda: (a) save effect roda primeiro (text antigo + sessionId NOVO → grava texto da sessão A no draft store da sessão B); (b) load effect roda, mas o save da iteração anterior já corrompeu B. Fix: usar `useRef<string>(sessionId)` + comparar antes de save; OR pendente save invalidado quando session ref muda. ADR-0111.

**F-CR37-14 — `Composer` action bar `'main'` hardcoded fallback (MEDIUM).**
`chat/components/composer/composer-action-bar.tsx:119` `affordances.workingDirLabel ?? 'main'` — fallback `'main'` em inglês. Mesmo bug em `working-dir-picker.tsx:200` `main?.label ?? 'main'`. Fix: `t('chat.composer.workingDir.defaultLabel')`. ADR-0109.

**F-CR37-15 — `tool-use-block` plural hardcoded (MEDIUM).**
`chat/components/transcript/message-card/tool-use-block.tsx:81` retorna `${entries.length} ${entries.length === 1 ? 'arg' : 'args'}` — plural inglês fixo. Fix: `t('chat.toolUse.argsCount', { count })`. ADR-0109.

**F-CR37-16 — `kind`/`category` enum values renderizados raw (MEDIUM).**
`sources/components/source-card.tsx:183` `{kind}` (e.g. `'mcp-stdio'`, `'managed'`) e `:195` `{category}` (e.g. `'google'`, `'microsoft'`) vão direto ao DOM como text — sem tradução. `KindBadge` não traduz. Fix: `t('sources.kind.${kind}' as TranslationKey)` (com keys novas) — embora cast `as TranslationKey` precisa de validação. ADR-0109.

**F-CR37-17 — `t(`namespace.${dynamic}` as TranslationKey)` bypass (MEDIUM).**
9+ sites usam dynamic key construction com cast: `sources-page.tsx:171,175`; `source-card.tsx:175`; `source-picker.tsx:90,169`; `catalog-item.tsx:26,56`; `migration-wizard.tsx:194,211`. Cast `as TranslationKey` bypassa o sistema de keys tipadas — typo silencioso retorna a key como fallback. Fix: enum-to-key map (ex.: `const KIND_KEYS: Record<SourceKind, TranslationKey> = { 'mcp-stdio': 'sources.kind.mcpStdio', ... }`) — pattern correto já em `model-catalog.ts` e `thinking-level.tsx:LABEL_KEYS`. ADR-0109.

**F-CR37-18 — `messageKey: string` em catálogos (MEDIUM).**
`workspaces/types.ts:38,39,66,71-77` `PermissionPresetConfig.labelKey`/`descriptionKey` e `SourceSeed.labelKey` declarados como `string` em vez de `TranslationKey`. `workspaces/logic/validate.ts:6` `messageKey: string`. Consequence: caller faz `t(preset.labelKey as Parameters<typeof t>[0])` — cast em cada usage. CLAUDE.md "Padrões obrigatórios → i18n via labelKey": catálogos UI usam `labelKey: TranslationKey`. Fix: tipar como `TranslationKey`. ADR-0109.

**F-CR37-19 — Erros de auth/onboarding/migration renderizados raw (MEDIUM).**
`auth/components/login-card.tsx:138 → AuthErrorBanner message={errors.email}` — `state.message` vem de `errorMessage(err)` (`use-login-controller.ts:175-178`) que retorna `err.message` cru — geralmente inglês do Supabase. `onboarding-wizard.tsx:289` `{error}` rendered raw. `migration-wizard.tsx:226 {w}`, `:212 {step.description}`, `:327 {message}` — strings vindas do backend renderizadas raw. Fix: backend retorna `error.code` + params; frontend mapeia para `t(${code})`. ADR-0109/parity.

**F-CR37-20 — Permission modal: shortcut keys + sem Esc cancel (LOW).**
`chat/permissions/permission-modal.tsx:63-64` keys `'a'`/`'d'` hardcoded para allow/deny. OK em locale-neutral, mas `<Dialog open={true}>` sem `onOpenChange` — Esc não fecha o modal (paradoxo: typeahead de menção tem Esc, modal de permissão crítica não). Fix: adicionar `onOpenChange` que mapeia para `deny` (default safer); document shortcut em help. ADR-0116/0110.

**F-CR37-21 — `copy-button` setTimeout sem cleanup + clipboard error swallow (LOW).**
`chat/components/transcript/actions/copy-button.tsx:17` `setTimeout(() => setCopied(false), 1500)` sem ref/cleanup — se componente unmount durante o intervalo, React warning sobre setState em unmounted. `clipboard.writeText` pode rejeitar (permissão denied, contexto não-secure) — `.then()` sem `.catch()` swallowing silencioso. Fix: useRef para timeout + cleanup; toast em failure. ADR-0012.

**F-CR37-22 — Test coverage 3/172 sources (LOW).**
`packages/features/src/__tests__` total: `chat/__tests__/transcript/*` (1), `workspaces/__tests__/validate.test.ts`, `settings/__tests__/categories.test.ts`. Hooks críticos sem teste: `use-permission-provider`, `use-voice-recorder`, `use-streaming-text`, `use-search-matches`, `use-composer-state`, `use-mention-typeahead`, `use-slash-typeahead`, `use-login-controller`, `use-auto-scroll`, `use-scroll-to-match`. Componentes críticos sem teste: `Composer`, `TranscriptView`, `PermissionModal`, `LoginCard`, `MigrationWizard`, `OnboardingWizard`, `SessionsPanel`. Memory monitoring/snapshots inexistentes. `vitest.config.ts` e package script `test` exists mas vazio na prática.

**Áreas auditadas**: chat (composer/transcript/tool-renderers/permissions/hooks/markdown), sessions (list/lifecycle/labels/branching/global-search/shortcuts), workspaces (wizard/settings-panel/delete/multi-window/active-store), projects (list/card/files/tasks/legacy-import), sources (page/card/catalog/picker/stdio-dialog), settings (12 categorias/api-keys/services/permissions), shell (navigation/command-palette/sub-sidebar/global-shortcuts), auth (login-card/use-login-controller/reset-dialog), onboarding (wizard), news (panel/detail), migration (wizard).

**Não-issues confirmados**: imports limpos (boundary OK — só kernel/translate/ui/ipc); zero `as any`/`@ts-ignore`/`console.*`; static model catalog é ADR-0117 intencional (não V1 parity gap); largest file 438 LOC (compliance OK); React 19 `useEffectEvent` em `use-global-shortcuts` é stable. CR-30 F-CR30-2 fix aplicado em chat side mas regressão completa em workspaces side (F-CR37-1).
