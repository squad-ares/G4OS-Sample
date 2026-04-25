---
'@g4os/desktop': patch
---

Fix `Cannot find module 'whatwg-url'` ao tentar login no app empacotado.
Mesma classe de problema das deps transitivas de pino: `@supabase/node-fetch`
precisa de `whatwg-url` (que precisa de `tr46` + `webidl-conversions`), e o
pnpm com hoist controlado não disponibiliza essas no app empacotado.

Adicionadas como deps diretas: `@supabase/{auth,functions,node-fetch,postgrest,realtime,storage}-js`,
`whatwg-url`, `tr46`, `webidl-conversions`, `isows`, `ws`.

Bump 0.0.6-beta.
