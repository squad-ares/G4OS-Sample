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
