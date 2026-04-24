# ADR 0091: Supabase OTP flow — fallback email→signup + looksLikeInvalidOtp

## Metadata

- **Numero:** 0091
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-09-01 (epic 09-auth)

## Contexto

Bug confirmado na v1 (#3127): `verifyOtp` sempre enviava `type: 'email'`. Para usuários novos, o Supabase 2024+ gera um token de `type: 'signup'`; retornar `type: 'email'` devolve INVALID_OTP — o usuário via erro mesmo com código correto. Fix era manual: usuário tentava novamente e o Supabase às vezes aceitava na segunda tentativa por race de estado.

Adicionalmente, sem setup guide formal, o time quebrava a config do Supabase (OTP length, template, expiry) em todo ambiente novo.

Requisitos:
- `verifyOtp` tenta `type: 'email'` primeiro; se detecta resposta de "invalid", retenta com `type: 'signup'`
- `looksLikeInvalidOtp(errorMessage)` centraliza a heurística de detecção de "invalid token" vs outros erros
- `sendOtp` puro — sem acoplamento a SDK diretamente (porta `SupabaseAuthPort` injetável)
- Setup guide em `docs/supabase-setup.md`

## Opções consideradas

### Opção A: request `type: 'email'` rígido (status quo v1)

**Rejeitada:** falha silenciosa para todos os novos usuários.

### Opção B: detectar tipo de usuário via `getUser` antes do verify

**Rejeitada:** race condition entre `signInWithOtp` e `getUser`; requer sessão pré-existente que não existe para novos usuários.

### Opção C: fallback `email → signup` com heurística (escolhida)

`verifyOtp` tenta `type: 'email'`; se erro com mensagem contendo `'invalid'` / `'expired'` / `'token'` (detecção por `looksLikeInvalidOtp`), retenta com `type: 'signup'`. Se segundo attempt falhar, retorna `err(AUTH_OTP_INVALID)`.

## Decisão

Opção C. `@g4os/auth/otp` exporta `sendOtp(email, port)` + `verifyOtp(email, token, port)`. `SupabaseAuthPort` é uma interface — implementação real com `@supabase/supabase-js` fica em `apps/desktop`.

`looksLikeInvalidOtp(msg: string)` usa `/invalid|expired|token/i` — centralizado para facilitar ajuste se Supabase mudar mensagens de erro.

## Consequências

**Positivas:**
- Bug #3127 corrigido: novos usuários autenticam na primeira tentativa sem erro
- `SupabaseAuthPort` injetável → 4 testes sem Supabase real (mocks síncronos)
- `looksLikeInvalidOtp` testado isoladamente — heurística documentada e alterável em 1 linha

**Negativas:**
- Segunda chamada tem latência adicional (round-trip extra para novos usuários na primeira auth)
- Heurística de string pode false-positive em mensagens de erro futuras do Supabase

**Neutras:**
- `shouldCreateUser: true` em `signInWithOtp` garante criação automática de conta sem pré-signup

## Armadilhas preservadas da v1

1. `type: 'email'` rígido — falha em novos usuários. v2: fallback explícito para signup.
2. Sem setup guide — team quebrava config. v2: `docs/supabase-setup.md` passo a passo.

## Referências

- ADR-0094 (SessionRefresher — correlato no épico de Auth)
- ADR-0011 (Result<T, E> via neverthrow)
- `STUDY/Audit/Tasks/09-auth/TASK-09-01-supabase-otp.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-09-01 landed).
