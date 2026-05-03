---
'@g4os/desktop': patch
'@g4os/ui': patch
'@g4os/translate': patch
---

Debug HUD: UX evolution + insights + ações (Fase 1+2+3 do plano).

**Fase 1 — UX foundation.** Migrado de inline styles + 7 cards empilhados
para Tailwind/`@g4os/ui` com tabs (Visão Geral / Memória / IPC & Sessões /
Logs / Vault). Header com status agregado (`Tudo OK` / `N alertas` / `Crítico`)
+ uptime + 3 ações globais (GC, Exportar, Recarregar). Tab "Logs"
virtualizada com `@tanstack/react-virtual` + drawer modal de detalhe ao
clicar numa linha — resolve scroll horizontal (logs longos antes eram
cortados com ellipsis sem alternativa).

**Fase 2 — Insights pra leigos.** Novo módulo puro `insights.ts` com 7
regras heurísticas que traduzem números crus em diagnósticos acionáveis
em pt-BR (ex.: `growth > 5MB/min` → "Memória crescendo rápido — pode ser
vazamento. Tente recarregar a janela. [Recarregar janela]"). Renderizados
como banner cards no topo de "Visão Geral" com CTA opcional.

**Fase 3 — Ações úteis.** 7 IPCs novos sob `debug-hud:action:*`:
`force-gc` (requer `--expose-gc`), `cancel-turn`/`cancel-all-turns`,
`reset-listeners`, `clear-logs`, `export-diagnostic` (Save Dialog +
`exportDebugInfo`), `reload-renderer`. Cada ação retorna `ActionResult`
tipado; renderer mostra toast inline com sucesso/erro. Handlers puros em
`main/debug-hud/actions.ts`; closures dependentes do composition root
(Electron dialog, paths) em `services/debug-hud-actions-bootstrap.ts`.

**Arquivos novos no renderer:** `insights.ts`, `format.ts`, `global.d.ts`,
`use-hud-snapshot.ts`, `use-hud-actions.ts`, `components/{card, header,
insights-banner, log-detail-drawer, memory-sparkline, tab-overview,
tab-memory, tab-ipc, tab-logs, tab-vault}.tsx`. Antigo `app.tsx` (561 LOC,
exempted) substituído por orquestrador de 174 LOC; cada peça <200 LOC.
Exemption removida de `check:file-lines`.

**Main process:** `MAIN_LIMIT` 10700 → 11050 documentado. Novos arquivos:
`debug-hud/actions.ts` (166 LOC) + `services/debug-hud-actions-bootstrap.ts`
(102 LOC). Aggregator ganhou método público `clearLogBuffer()`. Preload
`debugHud.invoke(action, payload?)` adicionado.

**Tier 1 — Friendliness pra leigos (mesma rodada):**

- **Glossário pt-BR** (`glossary.ts`): definição amigável de cada métrica
  (memória RSS, heap, p50/p95, listeners, vault, etc.) sem jargão.
- **`<MetricLabel id="..." />`** com tooltip do glossário — substitui
  hardcoded labels técnicos em todas as tabs. ID desconhecido degrada
  graciosamente (texto cru sem tooltip).
- **Health Score (0-100)** no header, substituindo o badge severity-only.
  Badge com circular ring + cor + label ("Saudável/Atenção/Crítico"),
  resposta de 1 segundo pra "tudo OK?". Lógica pura em `health-score.ts`
  (`100 - critical*30 - warn*10 - info*3`, clamped).
- **`<ThresholdBar>`** com bandas semânticas: barra colorida (verde/amarelo/
  vermelho) que dá contexto visual a memória RSS, listeners total e
  IPC p95. Usuário leigo vê "está alto?" instantaneamente.
- **Logs por categoria** (Atividade normal / Avisos / Erros / IA & Agentes /
  Dados & Credenciais) em vez de níveis técnicos — pills no topo da tab.
  Mapeamento por prefixo de `component` em `log-categories.ts`.
- **Botão "Reportar problema"** prominente no header. Modal monta
  diagnóstico (export-diagnostic) + textarea + relatório pré-formatado
  (versão, plataforma, caminho do ZIP) + "Copiar tudo" pro clipboard.
  Reduz drasticamente o atrito pra suporte.
- **Hints contextuais** em cada card da Visão Geral: rodapé pt-BR com
  *"o que olhar"* e *"quando se preocupar"*.
- **Renomeação leiga** das ações: "Forçar GC" → "Liberar memória",
  "Reload Renderer" → "Recarregar a tela", "Limpar logs" → "Limpar
  histórico". IPC interno preservado.

**i18n compliance (mesma rodada).** Code review apontou que o HUD
estava 100% pt-BR hardcoded — violação direta da regra "Strings
hardcoded em catálogos quebram troca de locale em runtime". Refatorado:

- 223 chaves novas em `@g4os/translate` (1113 → 1336 keys, paridade
  pt-BR ↔ en-US verificada).
- `glossary.ts`, `insights.ts`, `log-categories.ts`, `health-score.ts`
  refatorados pra carregar `TranslationKey` em vez de strings.
- `Insight` ganhou `params: Record<string, string|number>` para
  interpolação (ex.: `{growth}` no título). Renderer chama
  `t(titleKey, params)`.
- `ActionResult` (main → renderer via IPC) substituiu `message: string`
  por `messageKey: string` + `params` opaco. Strings nunca cruzam o
  boundary; renderer mapeia em TranslationKey via cast unificado.
- `TranslateProvider` adicionado no `main.tsx` do HUD (default
  `pt-BR`; locale switching via `<LanguageSwitcher>` futuro).
- 13 componentes do HUD migrados pra `useTranslate()`.
- `@g4os/ui` re-exporta `type TranslationKey` para consumidores
  evitarem dep direta em `@g4os/translate`.

**Code Review 31 — 12 findings aplicados (mesma rodada).** Auditoria
hierárquica do HUD identificou bugs e violações de convenção:

- **F-CR31-1 (MAJOR):** toast nunca auto-dismissa porque o effect tem
  `onDismiss` nas deps e o parent re-renderiza 1Hz; fix removendo
  `onDismiss` das deps (cleanup ainda chama via closure capture).
- **F-CR31-2 (MAJOR):** `reset-listeners` retornava `ok: true` sem
  fazer nada; fix retorna `ok: false` honesto + nova chave i18n
  `debugHud.action.error.resetListenersUnsupported`.
- **F-CR31-3 (MEDIUM):** `cancel-turn` coercia `sessionId` com
  `String()` — `null` virava `"null"` (4 chars). Fix valida
  `typeof === 'string'` antes.
- **F-CR31-4/6 (MEDIUM):** IPC `save-config` aceitava `payload as never`
  e `loadHudState` fazia cast. Adicionado `HudPersistedStateSchema` Zod
  + `safeParse` em ambos os lados.
- **F-CR31-5 (MEDIUM):** `state.ts` migrou de `writeFile` cru para
  `writeAtomic` (ADR-0050) — alinhamento com `window-bounds.ts`.
- **F-CR31-7 (MEDIUM):** `windowManager.list()[0]` substituído por
  novo método `WindowManager.getMain()` documentando a intenção.
- **F-CR31-8 (LOW):** strings hardcoded em `debug-hud-actions-bootstrap`
  extraídas para constantes (`DIALOG_TITLE_PT_BR`, `FILENAME_PREFIX`,
  `DEFAULT_APP_NAME`).
- **F-CR31-9 (LOW):** removido cast redundante `as never as never`.
- **F-CR31-10 (LOW):** `tMessageKey` agora tipa `t` como
  `(key: TranslationKey) => string` em vez de `(key: never)`.
- **F-CR31-11 (LOW):** `getAppMeta` hardcoded substituído por IPC
  `debug-hud:get-app-meta` + hook `useAppMeta` com cache por sessão.
- **F-CR31-12 (LOW):** `MetricLabel.id` agora é `MetricId =
  keyof typeof GLOSSARY` — typo no id falha em compile-time.

**Fase 4 (post-MVP, deferida):** chart real para memória (recharts
ou similar), filtros avançados nos logs por traceId/sessionId, persistência
de tab ativa em `PreferencesStore`, modo simples vs avançado toggle,
tour de primeira vez, feedback "antes/depois" nas ações.
