---
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ui': patch
'@g4os/translate': patch
'@g4os/credentials': patch
---

CR9-CR12 cleanup batch:

- **CR10:** Extract `handlePermissionRequired` from session route to `session-page-helpers` (route LOC under cap); raise main-size budget to 7250 with documented reason.
- **CR11:** Configure knip to ignore `node:sqlite` (Node 24 stdlib) — fixes `check:dead-code` gate.
- **CR12 BLOCKERS:**
  - B1 — Add missing z-index tokens (`--z-modal`, `--z-dropdown`, `--z-floating-menu`) in `globals.css`. Modais/popovers/dropdowns ficavam sem z-index em Tailwind v4.
  - B2 — Convert `TASK_STATUS_LABELS` to `TASK_STATUS_LABEL_KEYS` (`TranslationKey`). Add `TASK_PRIORITY_LABEL_KEYS` for task priority. Remove hardcoded pt-BR strings from `projects/types.ts`.
  - B3 — Convert `thinking-level` `LABELS` (English) to `LABEL_KEYS`. Add `chat.thinkingLevel.{minimal,low,medium,high}` translation keys.
  - B4 — Move `ConfirmDestructiveDialog` from `@g4os/features/chat` to `@g4os/ui` (generic primitive). Replace `window.confirm` in `source-card.tsx` with the dialog. Add `sources.delete.{title,confirmLabel,cancelLabel}` translation keys.
  - B5 — Fix mutex bypass in `CredentialVault.get()` for expired credentials. Auto-delete now goes through `writeLock.runExclusive` (was a race vs concurrent `set()`).
- **Operational:**
  - ADR-0155: Disable `noExcessiveCognitiveComplexity` Biome rule. 13 supressions removed; rule was always suppressed with same justification ("linear flow loses clarity if split").
  - Remove orphan `biome-ignore` in `search-results-renderer.tsx`.
