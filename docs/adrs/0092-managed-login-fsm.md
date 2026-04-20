# ADR 0092: ManagedLoginService — FSM discriminado + DisposableBase

## Metadata

- **Numero:** 0092
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-09-02 (epic 09-auth)

## Contexto

A v1 não tinha FSM de login — estados eram flags booleanas espalhadas (`isLoggingIn`, `isVerifying`) sem garantia de transições válidas. Isso causava estados simultâneos impossíveis (ex: `isLoggingIn && isVerifying`) e tornava difícil testar o fluxo completo sem Electron.

Requisitos:
- Estado discriminado (`idle → requesting_otp → awaiting_otp → verifying → bootstrapping → authenticated | error`)
- Sem estado simultâneo inválido
- `DisposableBase` — sem vazamento de subscription RxJS ao dispose
- `BehaviorSubject<ManagedLoginState>` exposto como `.asObservable()` — nunca expõe subject diretamente
- Injetável: `SupabaseAuthPort`, `AuthTokenStore`, timer — sem Electron ou Supabase nos testes

## Opções consideradas

### Opção A: flags booleanas + callbacks (status quo v1)

**Rejeitada:** estado simultâneo inválido. Difícil testar transições. Sem cleanup de subscriptions.

### Opção B: Redux-style reducer externo

**Rejeitada:** overhead para um FSM com 7 estados. Exige store global não compatível com padrão RxJS do projeto.

### Opção C: `ManagedLoginService extends DisposableBase` com `BehaviorSubject` (escolhida)

Classe com estado interno em `BehaviorSubject<ManagedLoginState>`. Métodos `requestOtp(email)` e `submitOtp(token)` mudam o estado via transições discriminadas. Falhas retornam `err(AuthError)` sem mudar para estado inválido.

## Decisão

Opção C. `@g4os/auth/managed-login` exporta `ManagedLoginService`:

| Estado | Transições válidas |
|---|---|
| `idle` | `requestOtp` → `requesting_otp` |
| `requesting_otp` | sucesso → `awaiting_otp`; erro → `error` |
| `awaiting_otp` | `submitOtp` → `verifying` |
| `verifying` | sucesso → `bootstrapping`; OTP inválido → `error` |
| `bootstrapping` | token salvo → `authenticated` |
| `authenticated` | `logout` → `idle` |
| `error` | `retry` → `idle` |

`dispose()` (herdado de `DisposableBase`) faz `unsubscribe` de todas as subscriptions RxJS internas.

## Consequências

**Positivas:**
- Zero estado inválido simultâneo — TypeScript narrowing garante em compile time
- 6 testes sem Electron ou Supabase real: `requestOtp → success`, `requestOtp → network error`, `submitOtp → success`, `submitOtp → OTP invalid`, `dispose cancels subscription`, `retry from error`
- `BehaviorSubject.asObservable()` — renderer subscreve sem acesso ao subject

**Negativas:**
- FSM com 7 estados é mais código que flags — justificado pela eliminação de estados impossíveis e facilidade de debugging

## Armadilhas preservadas da v1

1. Flags booleanas simultâneas inválidas. v2: estado discriminado único.
2. Subscriptions RxJS sem cleanup. v2: `DisposableBase` garante `unsubscribe` automático.

## Referências

- ADR-0091 (OTP flow — chamado pelo `ManagedLoginService`)
- ADR-0012 (DisposableBase)
- ADR-0011 (Result<T, E>)
- `STUDY/Audit/Tasks/09-auth/TASK-09-02-managed-login.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-09-02 landed).
