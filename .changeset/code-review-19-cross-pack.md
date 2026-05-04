---
'@g4os/kernel': patch
'@g4os/release-channels': patch
'@g4os/desktop': patch
---

code-review-19 cross-pack defensive fixes:

- `@g4os/kernel/src/fs/atomic-write.ts`: tmp filename agora usa `randomBytes(8).toString('hex')` além do `${pid}.${Date.now()}` — defesa contra colisão teórica entre 2 callers no mesmo PID + mesmo ms. Defense-in-depth barata; consumers em produção (CredentialVault, SourcesStore) usam mutex per-target, mas o helper é genérico e não pode assumir isso.

- `@g4os/release-channels/src/index.ts`: `feedUrlForChannel` agora usa `base.replace(/\/+$/, '')` em vez de `base.endsWith('/') ? base.slice(0, -1) : base` — strip de TODOS os trailing slashes, não apenas um. Input malformado `s3://bucket//` antes virava URL com `//` ainda; agora normaliza corretamente.

- `apps/desktop` (via `scripts/check-main-size.ts`): `MAIN_LIMIT` retrofit `10150 → 10300` para acomodar `services/services-prober.ts` (111 LOC), introduzido em commit `bd20855 feat(desktop): Services status screen` sem bump original. JSDoc histórico atualizado; CLAUDE.md/AGENTS.md sincronizados (4 refs cada). Próxima elevação deve preferir extração de `services-prober.ts` para `@g4os/observability/probe` (probe HTTP é observability-agnostic, sem deps de Electron).
