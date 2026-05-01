# @g4os/desktop-e2e

End-to-end smoke tests for the desktop app using Playwright + Electron. Part
of TASK-OUTLIER-23 (MVP scope).

## Scope

Phase 1 (MVP) — ships now:

- `tests/smoke-launch.e2e.ts` — verifies the Electron main boots, opens a
  window, and renders the shell sidebar.

Phase 2 — authenticated flows (follow-up):

- login with mocked Supabase OTP
- create workspace → create session → send "hi" → receive response
- model selector → switch model
- settings → API key persistence
- MCP stdio source creation + test connection
- tool use → permission modal approve → tool result rendered
- stop mid-stream + retry last turn
- search in transcript
- voice input → transcript appears in composer

Phase 2 requires CI-side API keys (or a full mock provider harness) and a
dedicated Supabase test project — both out of scope for the initial MVP.

## Running locally

```bash
pnpm --filter @g4os/desktop build
pnpm --filter @g4os/desktop-e2e test:e2e
```

The tests spawn Electron via `_electron.launch()` pointing at
`apps/desktop/out/main/index.js`. Each test uses a fresh `userDataDir`
under `tmpdir()` to avoid state bleed.

## CI

A nightly GitHub Actions workflow will run the suite on Linux with `xvfb`
(see `.github/workflows/e2e.yml` once it lands — not part of this MVP
drop).

## Memlab gate (TASK-17-11)

`tests/memory-cycle.e2e.ts` é um gate de heap leak do Debug HUD. Mede
delta de heap após N ciclos de interação com o atalho global (proxy de
abre/fecha do HUD). Falha se delta > 5MB (default).

### Calibração local

Antes de ajustar threshold em CI, rode em modo baseline 3-5 vezes:

```bash
pnpm --filter @g4os/desktop build
pnpm --filter @g4os/desktop-e2e memlab:hud:baseline
```

`G4OS_MEMLAB_BASELINE=1` desativa o `expect()` e imprime amostras por
ciclo. Observe a distribuição:

- **Sem leak**: delta estabiliza após ~5 ciclos de warmup (típico < 2MB)
- **Com leak**: delta cresce ~linearmente por ciclo (escala com `CYCLE_COUNT`)

Após coletar 3-5 runs, escolha threshold = **2-3x o p95 observado** pra
absorver ruído de GC sem ser flaky.

### Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `G4OS_E2E_MEMLAB` | — | obrigatória (`=1`) — opt-in do gate |
| `G4OS_MEMLAB_CYCLES` | 30 | número de ciclos abre/fecha simulados |
| `G4OS_MEMLAB_THRESHOLD_MB` | 5 | falha se `final - baseline > N MB` |
| `G4OS_MEMLAB_BASELINE` | — | `=1` desativa assert, só imprime amostras |

### Run de produção

```bash
pnpm --filter @g4os/desktop-e2e memlab:hud
```

Roda em CI noturno via `.github/workflows/memlab-nightly.yml`. Falha
abre issue automática com label `memlab` + `leak`.
