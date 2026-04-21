# @g4os/auth

Autenticação gerenciada do G4 OS v2. Implementa login por OTP, máquina de estados de sessão, checagem de entitlement e refresh de token em background — tudo atrás de portas injetadas, de modo que o pacote não depende de `@supabase/supabase-js` nem de `@g4os/credentials`.

## Sub-paths de importação

| Subpath | Conteúdo |
|---|---|
| `@g4os/auth` | Re-exporta tudo |
| `@g4os/auth/types` | `AuthSession`, `SupabaseAuthPort`, `AuthTokenStore`, constantes de chaves |
| `@g4os/auth/otp` | `sendOtp`, `verifyOtp` (com fallback email → signup, fix do bug V1) |
| `@g4os/auth/managed-login` | `ManagedLoginService`, FSM `ManagedLoginState` |
| `@g4os/auth/entitlement` | `EntitlementService`, `Entitlements`, `DEV_ENTITLEMENTS` |
| `@g4os/auth/refresh` | `SessionRefresher` (refresh em background + `reauth_required`) |
| `@g4os/auth/supabase` | Adapter do SDK Supabase (lazy import) + validação/loader de `.env` |

## Fronteiras

`@g4os/auth` depende apenas de `@g4os/kernel`, `neverthrow` e `rxjs`. Nunca importa `@supabase/supabase-js`, `@g4os/credentials` ou `electron` — essas são amarrações feitas pelo `apps/desktop` no boot.

## Portas DI

Todos os pontos de integração são injetados na construção:

- `SupabaseAuthPort` — embrulha o cliente Supabase para OTP send/verify/refresh
- `AuthTokenStore` — embrulha o `CredentialVault` para persistência de tokens
- `EntitlementClient` — embrulha a chamada HTTP `/api/entitlements`

## Dev bypass

`EntitlementService` aceita `devBypass: true` (opt-in via env; bloqueado em release por gate de CI). Devolve `DEV_ENTITLEMENTS` sem chamar a rede e dispara o callback opcional `onBypassUsed` para observability. Ver ADR-0093.
