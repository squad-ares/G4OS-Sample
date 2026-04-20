# @g4os/auth

Managed authentication for G4 OS v2. Implements OTP-based login, session state machine, entitlement checks and background token refresh — all behind injected ports so the package has no dependency on `@supabase/supabase-js` or `@g4os/credentials`.

## Subpath exports

| Subpath | Contents |
|---|---|
| `@g4os/auth` | Re-exports everything |
| `@g4os/auth/types` | `AuthSession`, `SupabaseAuthPort`, `AuthTokenStore`, key constants |
| `@g4os/auth/otp` | `sendOtp`, `verifyOtp` (email → signup fallback, V1 bug fix) |
| `@g4os/auth/managed-login` | `ManagedLoginService`, `ManagedLoginState` FSM |
| `@g4os/auth/entitlement` | `EntitlementService`, `Entitlements`, `DEV_ENTITLEMENTS` |
| `@g4os/auth/refresh` | `SessionRefresher` (background refresh + `reauth_required`) |

## Boundaries

`@g4os/auth` depends only on `@g4os/kernel` and `neverthrow`/`rxjs`. It never imports `@supabase/supabase-js`, `@g4os/credentials`, or `electron` — those are wired by `apps/desktop` at startup.

## DI ports

All integration points are injected at construction:

- `SupabaseAuthPort` — wraps Supabase client for OTP send/verify/refresh
- `AuthTokenStore` — wraps `CredentialVault` for token persistence
- `EntitlementClient` — wraps the `/api/entitlements` HTTP call

## Dev bypass

`EntitlementService` accepts `devBypass: true` (env-flag only; blocked in release by CI gate). Returns `DEV_ENTITLEMENTS` without network call and invokes optional `onBypassUsed` callback for observability. See ADR-0093.
