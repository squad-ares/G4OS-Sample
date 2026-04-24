# ADR 0142: E2E testing — Playwright + Electron smoke harness

## Metadata

- **Numero:** 0142
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-23 (E2E parity, MVP)

## Contexto

Nenhum E2E rodava v2 end-to-end antes de OUTLIER-23. Unit + contract tests cobrem IPC e kernel, mas um regress de "app não abre", "sidebar não renderiza" só aparece em reprodução manual. OUTLIER-23 Phase 1 (MVP) pede harness smoke que prova launch + UI básica em CI (nightly inicialmente, pré-release eventualmente).

Restrições:

1. Não temos Supabase test project nem API keys em CI — flows autenticados são Phase 2 (deferred).
2. Cada test precisa `userDataDir` isolado — senão credentials + DB de um run contaminam o próximo.
3. Electron spawn pelo Playwright precisa do build `apps/desktop/out/main/index.js` pronto. Pre-requisite documentado no README do package.

## Opções consideradas

### Opção A: Puppeteer + manual electron spawn
**Contras:** Puppeteer-electron existe mas é menos idiomático que Playwright-electron. API surface diverge.

### Opção B: Spectron (legacy Electron testing)
**Contras:** oficialmente descontinuado. Não é escolha sustentável.

### Opção C: `@playwright/test` + `_electron.launch()` API oficial (aceita)
**Descrição:**
- Novo package `apps/desktop-e2e/` com `@playwright/test` dep.
- `apps/desktop-e2e/tests/helpers/launch-app.ts` — `launchApp()` helper: `mkdtempSync(tmpdir, 'g4os-e2e-')` → passa como `--user-data-dir=...` + env `G4OS_E2E=1`, `NODE_ENV=test`. Na teardown, `rm -rf` do userDataDir.
- `apps/desktop-e2e/tests/smoke-launch.e2e.ts` — 2 tests: "app launches" (assert janela abre) + "shell sidebar visible" (assert seletor DOM conhecido).
- `apps/desktop-e2e/playwright.config.ts` — `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`. Reporter: `github` em CI, `list` local. Process.env reads marcados com biome-ignore + reason.
- README documenta Phase 2 flows (send msg, model switch, MCP create, permission modal, abort, retry, truncate, search, voice) como follow-up.

## Decisão

**Opção C.** Phase 1 entrega 2 smoke tests — provam que (a) electron inicializa, (b) renderer monta. CI noturno pode expandir gradualmente com flows autenticados quando houver mock Supabase.

## Consequências

### Positivas
- Regress estrutural (build quebrado, preload sumido, renderer crashando no boot) detectado pre-merge.
- Isolamento real de userDataDir: tests paralelos não colidem (apesar de `fullyParallel: false` por enquanto pra Electron).
- Retain-on-failure: videos + screenshots disponíveis pra debug quando CI falha.

### Negativas / Trade-offs
- Apenas 2 de 10 flows da AC inicial da OUTLIER-23 cobertos. Aceito — Phase 2 exige mocks + API keys que não temos no estado atual do projeto.
- Electron spawn é lento (~5-8s por test). Paralelismo fica como optimization pra quando suite crescer (ex: `workers: 4`).

### Neutras
- CI workflow pra rodar esse harness (GitHub Actions com `xvfb-run` no Linux) vai em FOLLOWUP-OUTLIER-23 Phase 2, junto com os outros flows.

## Validação

- `pnpm --filter @g4os/desktop build && pnpm --filter @g4os/desktop-e2e test:e2e` local: 2 tests verdes.
- README documenta pre-requisite do build.
- `playwright.config.ts` passa biome lint (com `biome-ignore lint/style/noProcessEnv` + reason pro CI env check).

## Referencias

- TASK-OUTLIER-23 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
