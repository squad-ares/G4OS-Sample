---
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/translate': patch
---

Services status probe + Sentry IPC fix + Projects routing fix.

**Services screen (settings/services)**. New 15th settings category with real HTTP connectivity probing for Sentry, OTLP, and Prometheus endpoints. Replaced static boolean flags with active HTTP HEAD requests (3s timeout, parallel via `Promise.all`). `ServiceStatus` type now carries `{ configured, reachable: boolean|null, latencyMs, error, endpoint }`. UI shows 4 states: not configured (WifiOff), active with latency (Activity + ms), unreachable (AlertTriangle + error text), checking (spinning). Refresh button via TanStack Query `refetch()`.

**`@g4os/ipc` contract update**. `ServicesStatusMap` in `IpcContext` now uses rich `ServiceStatus` objects instead of booleans. `health.servicesStatus` procedure returns the full map. `createTestCaller` and `ipc-context` stubs updated with noop `ServiceStatus` objects.

**Sentry IPC fix**. `apps/desktop/src/preload.ts` now imports `@sentry/electron/preload` before contextBridge setup. This injects `window.__SENTRY_IPC__` so the renderer uses Classic IPC mode instead of falling back to `sentry-ipc://` fetch (which triggered CSP violations and "URL scheme not supported" errors). CSP `connect-src` extended with `sentry-ipc:` as belt-and-suspenders.

**Projects route fix**. `_app/projects.tsx` was rendering the full projects page content and lacked `<Outlet />`, so child routes (e.g. `/projects/new`) silently rendered nothing. Split into `projects.tsx` (thin `<Outlet />` wrapper) + `projects.index.tsx` (actual `ProjectsIndexPage`). Route tree regenerated.

**7 new i18n keys** (pt-BR + en-US parity): `activeWithLatency`, `notConfigured`, `unreachable`, `checking`, `refresh`, `lastChecked`, `errorPrefix`.
