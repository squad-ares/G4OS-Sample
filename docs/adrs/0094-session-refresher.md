# ADR 0094: SessionRefresher — timer injetável + reauth_required em falha

## Metadata

- **Numero:** 0094
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-09-04 (epic 09-auth)

## Contexto

A v1 disparava refresh de sessão JWT via `setTimeout` solto no main process:
1. **Sem tracking de timer** — reiniciar o app spawnava múltiplos timers para a mesma sessão (sem cleanup do anterior).
2. **Auto-logout em falha de refresh** — se o Supabase retornava erro (network flaky, token expirado retroativamente), a v1 forçava logout imediato. Usuário perdia sessão local e tinha que reautenticar.
3. **Testes não-determinísticos** — `setTimeout` real tornava testes flaky dependendo de timing.

Requisitos:
- `SessionRefresher extends DisposableBase` — `dispose()` cancela timer ativo
- `setTimer` injetável (default `globalThis.setTimeout`) — testes controlam tempo sem `vi.useFakeTimers` global
- Buffer de 5 minutos antes do `expiresAt` para agendar o refresh
- Falha de refresh → emit `reauth_required` (não logout forçado) — UI exibe dialog
- `now` injetável (default `Date.now`) — cálculo de scheduling determinístico em teste

## Opções consideradas

### Opção A: `setTimeout` direto no main process (status quo v1)

**Rejeitada:** múltiplos timers por sessão, auto-logout em falha, testes flaky.

### Opção B: `SessionRefresher` com DI de timer e `now` (escolhido)

`SessionRefresher` recebe `{ setTimer, now, store, port }`. Método `schedule(session)` calcula `delay = session.expiresAt - now() - BUFFER_MS` e chama `setTimer(refreshAndReschedule, delay)`. `cancel()` (via dispose) chama `clearTimer(handle)`.

Em falha de refresh, emite `{ type: 'reauth_required', sessionId }` via `BehaviorSubject<RefresherState>` — **never** auto-logout.

### Opção C: cron job em worker separado

**Rejeitada:** overhead de process boundary para um timer simples; incompatível com `utilityProcess` lifecycle.

## Decisão

Opção B. `@g4os/auth/refresh` exporta `SessionRefresher` + `RefresherState`:

| Estado | Descrição |
|---|---|
| `idle` | sem sessão agendada |
| `scheduled` | timer ativo, aguardando refresh |
| `refreshing` | chamada em progresso |
| `reauth_required` | refresh falhou — UI deve exibir dialog |

`BUFFER_MS = 5 * 60 * 1000` (5 minutos antes do expiry). Após refresh com sucesso, nova sessão é salva via `AuthTokenStore.set(...)` e `schedule(newSession)` é chamado recursivamente.

`AuthTokenStore.list()` retornando `ok('')` para keys ausentes é normalizado com `!refreshToken.value` (contrato implícito documentado aqui).

## Consequências

**Positivas:**
- Zero timer orphan — `dispose()` sempre cancela
- `reauth_required` preserva sessão local — usuário não perde contexto de trabalho
- 4 testes determinísticos sem `vi.useFakeTimers` global: schedule + refresh success, schedule + refresh failure → reauth_required, dispose cancels timer, reschedule after success

**Negativas:**
- `AuthTokenStore.list()` com semântica `ok('')` para ausente é contrato implícito — documentado aqui para evitar regressão

## Armadilhas preservadas da v1

1. `setTimeout` sem tracking → múltiplos timers. v2: `handle` rastreado + `cancel()` em dispose.
2. Auto-logout em refresh failure → perda de sessão. v2: `reauth_required` sem logout forçado.
3. Testes flaky por tempo real. v2: `setTimer`/`now` injetáveis.

## Referências

- ADR-0092 (ManagedLoginService — cria sessão que Refresher agenda)
- ADR-0012 (DisposableBase)
- ADR-0051 (safeStorage — backend do AuthTokenStore real)
- `STUDY/Audit/Tasks/09-auth/TASK-09-04-session-refresh.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-09-04 landed).
