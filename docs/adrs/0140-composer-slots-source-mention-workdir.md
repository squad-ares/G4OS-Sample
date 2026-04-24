# ADR 0140: Composer slots — SourcePicker + MentionPicker + WorkingDirPicker

## Metadata

- **Numero:** 0140
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Tasks relacionadas:** TASK-OUTLIER-18 (source picker), TASK-OUTLIER-19 (working-dir picker), TASK-OUTLIER-20 Phase 1 (mention typeahead)

## Contexto

O Composer do chat em V2 precisa de 4 affordances contextuais sem virar um painel monolito:

- **ModelSelector** (OUTLIER-17) — ADR 0117 existente cobre.
- **SourcePicker** (OUTLIER-18) — usuário escolhe quais fontes do workspace entram nesta sessão. Chip mostra count. Empty-state com CTA `/connections`.
- **WorkingDirPicker** (OUTLIER-19) — escolhe entre workspace root, projects registrados ou diretório custom via `showOpenDialog` do platform IPC. Persiste em `session.workingDirectory` (coluna SQLite via migration `20260423170000_sessions_working_directory`).
- **MentionPicker** (OUTLIER-20 Phase 1) — typeahead `@` inserindo marker plain-text `[source:slug]`. Futuro: chip-editor + `@file`/`@skill`/`#label`.

Restrições:

1. Composer já tem slot `onSend`. Adicionar 3 props específicos (`sourcePicker`, `workingDirPicker`, `modelSelector`, `mentionSources`) inflaria a API e quebraria test harnesses.
2. MentionPicker precisa intercept keyboard (Arrow/Enter/Esc) ANTES do submit do textarea.
3. Source intent detector (ADR-0137) processa `[source:slug]` plain-text — o marker gerado pelo picker é o mesmo contrato.

## Opções consideradas

### Opção A: Props explícitas (sourcePicker/workingDirPicker/modelSelector)
**Pros:** tipos explícitos.
**Contras:** composer vira 8+ props, difícil evoluir.

### Opção B: `affordances` record prop aceita ReactNode por key
**Contras:** menos type-safe (ReactNode acaba qualquer coisa).

### Opção C: Slot pattern via `affordances` record + named slots (aceita)
**Descrição:**
- `Composer` recebe `affordances?: { sourcePicker?: ReactNode; workingDirPicker?: ReactNode; modelSelector?: ReactNode; thinkingSelector?: ReactNode; ... }`. Cada key é posição fixa na barra inferior do composer.
- `mentionSources` é prop top-level porque o Mention requer hook no lifecycle do textarea (não é um slot visual).
- `ComposerTextarea` expõe `onCaptureKeyDown(handler: (event) => boolean)` + `getElement()` via imperative ref. MentionPicker registra handler que intercepta Arrow/Enter/Esc antes do submit.
- Marker plain-text `[source:slug]` é o formato inserido — backend intent detector (ADR-0137) parseia o mesmo.

## Decisão

**Opção C.** Slot pattern per named affordance + mention as special hook-based feature.

Detalhes de implementação:

- `useMentionTypeahead()` detecta `@` em start/whitespace position + extrai query substring até cursor. Retorna `{ active, query, cancel, onSelect }`.
- `MentionPicker` popover renderiza acima do textarea wrapper (não ancora ao caret — decisão pragmática; medir caret position em textarea é custo alto pra MVP).
- A11y (ADR-0012 spirit — componente rastreável): `combobox` role com `aria-controls`/`aria-activedescendant` em `MentionPicker`, `listbox` no `ul`, `option` em cada row com `aria-selected`. Teclado: Arrow navegam, Enter/Tab selecionam, Esc fecha. Screen readers anunciam mudanças.
- `WorkingDirPicker`: dropdown com seed `{ workspace-main, project-*, custom }`. "Custom" chama `platform.showOpenDialog` (IPC).
- `SourcePicker`: popover agrupado por kind (managed / mcp-http / mcp-stdio / api / filesystem), checkbox per source, status badges, rejected slugs mostrados como readonly. Empty state com link para `/connections`.

## Consequências

### Positivas
- Composer stay lean — `affordances` é opt-in per surface. Test harness passa `{}` e composer ainda funciona.
- Backend contract estável: `[source:slug]` inserido pelo mention picker é consumido pelo `SourceIntentDetector` sem acoplamento entre UI e agent.
- a11y MentionPicker em paridade com combobox pattern (ARIA 1.2), leitor de tela anuncia navegação.

### Negativas / Trade-offs
- MentionPicker anchor no wrapper (não no caret) — popover fica longe do `@` em textarea alta. Mitigação futura: migrar pra editor rich (Lexical/TipTap) como OUTLIER-20 Phase 2.
- Slot pattern aceita `ReactNode` livre. Se alguém passar componente errado no `sourcePicker` slot, erro só aparece em runtime (ou pela type de children do Composer). Trade-off aceito pra flexibilidade.

### Neutras
- Session page wire em `workspaces.$workspaceId.sessions.$sessionId.tsx` — helpers `formatSendError` + `mapPermissionDecision` extraídos pra `renderer/chat/session-page-helpers.ts` (manter route file ≤500 LOC).

## Validação

- SourcePicker selection persiste em `trpc.sessions.update({enabledSourceSlugs})` — TurnDispatcher lê na próxima turn via ADR-0137 planner.
- WorkingDir change persiste em `trpc.sessions.update({workingDirectory})` — TurnDispatcher passa para tool context (list_dir/read_file honram).
- MentionPicker insere `[source:slug]` no textarea — intent detector ativa mount explícito.
- A11y audit manual: keyboard-only navigation funciona no mention picker + source picker.

## Referencias

- ADR-0117 (model-selector-catalog)
- ADR-0137 (source mounting + intent detector)
- TASK-OUTLIER-17/18/19/20 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
