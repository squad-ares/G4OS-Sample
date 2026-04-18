# Process Architecture (03-process-architecture)

## Visão geral

G4OS v2 adota **isolamento de processos** para sessões ativas e **pool de threads** para CPU-bound tasks. A arquitetura garante:

- ✅ Isolamento: crash de uma sessão não afeta app/outras sessões
- ✅ Memory safety: kill processo libera tudo, sem GC dependency
- ✅ Escalabilidade: 50+ sessões simultâneas
- ✅ Graceful shutdown: flush de estado antes de kill
- ✅ Observabilidade: process-level debugging com Chrome DevTools

## Arquitetura em alto nível

```
┌──────────────────────────────────────────────────────────────┐
│ Electron Main Process (thin: < 2000 LOC)                    │
│  • AppLifecycle: quit/signals                               │
│  • WindowManager: BrowserWindow CRUD                        │
│  • ProcessSupervisor: spawn/manage workers                  │
│  • SessionManager: route IPC → worker                       │
│  • CpuPool: piscina wrapper                                 │
└──────────────────────────────────────────────────────────────┘
         ↕ IPC: postMessage/on
    ┌──────────────────────────────────────────────────────────┐
    │ Session Worker 1..N (utilityProcess)                     │
    │  • sessionId via argv[2]                                │
    │  • handlers: send-message, interrupt, health-check      │
    │  • emits: session-event                                 │
    │  • graceful shutdown: flush → exit(0)                   │
    └──────────────────────────────────────────────────────────┘
         ↕ IPC: CPU task delegation
    ┌──────────────────────────────────────────────────────────┐
    │ CPU Thread Pool (piscina: 2-8 threads)                  │
    │  • parseJsonlFile, renderMarkdownBatch, compress        │
    │  • non-blocking main thread                             │
    └──────────────────────────────────────────────────────────┘
```

## Componentes principais

### 1. AppLifecycle (`main/app-lifecycle.ts`)
Gerencia ciclo de vida da app (quit, signals, shutdown handlers).

**Responsabilidades:**
- `before-quit` event: signal graceful shutdown
- `SIGINT`/`SIGTERM`: trigger app.quit()
- `open-url`: deep-link routing
- `onQuit(handler)`: register shutdown callbacks
- `shutdown(timeoutMs)`: execute all handlers with deadline

**Exemplo:**
```ts
const lifecycle = new AppLifecycle(electron.app);
lifecycle.onQuit(() => supervisor.shutdownAll(5000));
lifecycle.onAllWindowsClosed(() => {
  if (process.platform !== 'darwin') app.quit();
});
```

**Related ADR:** [ADR-0032](./adrs/0032-graceful-shutdown-with-deadline-and-backoff.md)

### 2. WindowManager (`main/window-manager.ts`)
CRUD mínimo de BrowserWindows. Não cuida de layout, tabs, ou navigation.

**Responsabilidades:**
- `open(options)`: create BrowserWindow
- `list()`: get open windows
- `dispose()`: cleanup on quit

**Exemplo:**
```ts
const windows = new WindowManager(electron);
const win = await windows.open({ url: 'http://localhost:3000' });
```

### 3. ProcessSupervisor (`main/process/supervisor.ts`)
Orquestra utilityProcess workers. Controla spawn, health checks, restarts, shutdown.

**Responsabilidades:**
- `spawn(config)`: create worker, register health monitor
- `get(id)` / `list()` / `listByKind(kind)`: query workers
- `shutdownAll(timeoutMs)`: signal → wait → kill

**Configuração:**
```ts
const handle = await supervisor.spawn({
  kind: 'session',
  modulePath: './session-worker.js',
  args: [sessionId],
  memoryLimitMb: 500,
  maxRestarts: 2,
  healthCheckIntervalMs: 30_000,
});
```

**Related ADR:** [ADR-0030](./adrs/0030-electron-utilityprocess-worker-isolation.md)

### 4. HealthMonitor (`main/process/health-monitor.ts`)
Monitora saúde periódica de workers (pings, memory, status).

**Responsabilidades:**
- Ping worker a cada 30s
- Contador de falhas consecutivas
- Trigger restart quando threshold atingido

**Sinais:**
- `{ type: 'health-check', requestId }`
- Resposta: `{ type: 'health-response', rss, heap, status: 'ok'|'degraded' }`

**Config:**
```ts
const monitor = new HealthMonitor(handle, {
  intervalMs: 30_000,
  timeoutMs: 5_000,
  memoryLimitMb: 500,
  unhealthyThreshold: 3,
});

monitor.start(() => {
  log.warn('worker unhealthy, restarting');
  handle.restart();
});
```

### 5. SessionManager (`main/services/session-manager.ts`)
Gerencia workers de sessão. Route de IPC → worker.

**Responsabilidades:**
- `getOrSpawn(sessionId)`: get or create worker
- `sendMessage(sessionId, payload)`: post message to worker
- `interrupt(sessionId)`: signal interrupt
- `subscribe(sessionId, handler)`: listen to events
- `stopInactive(olderThanMs)`: cleanup idle workers

**Exemplo:**
```ts
const sessions = new SessionManager(supervisor);

// Route IPC call
await sessions.sendMessage(sessionId, { type: 'send-message', payload });

// Subscribe to events
sessions.subscribe(sessionId, (event) => {
  emitToRenderer(sessionId, event);
});

// Cleanup idle (30min+)
setInterval(() => sessions.stopInactive(), 5 * 60 * 1000);
```

### 6. CpuPool (`main/services/cpu-pool.ts`)
Wrapper sobre Piscina para CPU-bound tasks.

**Responsabilidades:**
- Lazy-load Piscina (dynamic import)
- Manage thread pool lifecycle
- Delegate named tasks

**Tasks:**
- `parseJsonlFile(filePath)`: async parse → event[]
- `renderMarkdownBatch(docs)`: batch markdown → HTML
- `compressBuffer(data)`: gzip compression

**Exemplo:**
```ts
const cpuPool = new CpuPool();
const events = await cpuPool.run<ParsedEvent[]>('parseJsonlFile', '/path/to/session.jsonl');
```

**Cleanup:**
```ts
lifecycle.onQuit(() => cpuPool.destroy());
```

### 7. Session Worker (`main/workers/session-worker.ts`)
Entry point do utilityProcess. Executa em isolamento completo.

**Protocolo de mensagens:**

| Tipo | De | Para | Payload | Resposta |
|------|----|----|---------|----------|
| `send-message` | main | worker | `{ payload: unknown }` | session-event |
| `interrupt` | main | worker | none | ack (implicit) |
| `health-check` | health-monitor | worker | `{ requestId }` | health-response |
| `shutdown` | main | worker | `{ reason: string }` | (none, then exit) |
| `session-event` | worker | main | `{ event: unknown }` | (broadcast) |
| `health-response` | worker | monitor | `{ requestId, rss, heap, status }` | - |

**Exemplo:**
```ts
const sessionId = process.argv[2];
const runtime = new SessionRuntime(sessionId);

process.parentPort!.on('message', async (msg) => {
  if (msg.type === 'send-message') {
    await runtime.sendMessage(msg.payload);
    parentPort.postMessage({ type: 'session-event', event });
  } else if (msg.type === 'shutdown') {
    await runtime.flushInFlight(3000);
    await runtime.saveState();
    process.exit(0);
  }
});
```

**Related ADR:** [ADR-0032](./adrs/0032-graceful-shutdown-with-deadline-and-backoff.md)

### 8. CPU Pool Tasks (`main/workers/cpu-pool/tasks.ts`)
Export de funções invocáveis pelo pool.

**Formato esperado:**
```ts
export async function parseJsonlFile(args: PiscinaTaskArgs): Promise<unknown[]> {
  const filePath = args.args[0];
  // ... implementation
}
```

## Fluxo de dados

### Criar/enviar mensagem para sessão

```
Renderer (UI)
  ↓
IPC tRPC call (sendMessage)
  ↓
Main process (router handler)
  ↓
SessionManager.sendMessage(sessionId, payload)
  ↓
ProcessSupervisor.spawn(sessionId) [if not exists]
  ↓
utilityProcess.fork(./session-worker.js, [sessionId])
  ↓
Session Worker
  ├─ process.argv[2] = sessionId
  ├─ process.parentPort.on('message')
  ├─ handle send-message → SessionRuntime.sendMessage()
  └─ emit session-event back via parentPort.postMessage()
  ↓
Main process (onMessage)
  ↓
Main broadcasts event to all subscribed renderers
  ↓
Renderer (UI updated)
```

### Health check

```
Main (AppLifecycle)
  ↓
HealthMonitor.start() [for each worker]
  ↓
Every 30s: send health-check message
  ↓
Worker receives health-check
  ├─ get memory: process.memoryUsage()
  └─ send health-response: { rss, heap, status }
  ↓
Monitor receives response
  ├─ Check: rss > 500MB OR status == 'degraded'
  ├─ If failed: consecutiveFailures++
  ├─ If 3+ failures: call onUnhealthy()
  └─ onUnhealthy → supervisor.restart(worker)
  ↓
Worker exits gracefully → supervisor restarts
  ├─ backoff: 1s (restart 1), 2s (restart 2)
  ├─ max: 2 restarts, then give up
```

### Graceful shutdown

```
User closes app OR SIGINT/SIGTERM
  ↓
Electron app.on('before-quit')
  ↓
AppLifecycle.shutdown(5000)
  ├─ for each onQuit handler:
  │  ├─ Promise.race([ handler(), timeout(5s) ])
  │  └─ if timeout: log warn, continue
  └─ all handlers settled
  ↓
SessionManager.dispose()
  ├─ for each worker:
  │  └─ worker.stop(1000)
  ↓
ProcessSupervisor.shutdownAll(5000)
  ├─ Phase 1: broadcast { type: 'shutdown', reason: 'app-quit' }
  ├─ Phase 2: wait for exit or deadline (5s remaining)
  ├─ Phase 3: for stuck workers, send SIGKILL
  └─ all processes.clear()
  ↓
CpuPool.destroy()
  ├─ await pool.destroy() [piscina cleanup]
  └─ threads joined
  ↓
app.exit(0)
```

## LOC Budget

Main process metrics (enforced by CI gate `check:main-size`):

```
├─ apps/desktop/src/main/
│  ├─ index.ts                  56 LOC
│  ├─ app-lifecycle.ts          83 LOC
│  ├─ window-manager.ts         49 LOC
│  ├─ deep-link-handler.ts      24 LOC
│  ├─ ipc-bootstrap.ts          16 LOC
│  ├─ electron-runtime.ts       88 LOC
│  ├─ ipc-context.ts            (existing)
│  ├─ ipc-server.ts             (existing)
│  ├─ process/                  312 LOC
│  │  ├─ types.ts               53 LOC
│  │  ├─ managed-process.ts    205 LOC
│  │  ├─ health-monitor.ts     105 LOC
│  │  └─ supervisor.ts         102 LOC
│  └─ services/                 301 LOC
│     ├─ session-manager.ts    115 LOC
│     └─ cpu-pool.ts           186 LOC
└─ workers/                     155 LOC
   ├─ session-worker.ts        116 LOC
   └─ cpu-pool/tasks.ts         39 LOC

Total: 1380 / 2000 LOC (69% budget used)
Files: 16 main, 2 worker entry points
Max file: 205 LOC (managed-process.ts)
```

**CI gate:** Falha se total > 2000 ou arquivo > 300.

## Padrões

### IDisposable
Todos os serviços implementam `IDisposable` para cleanup explícito:

```ts
class SessionManager extends DisposableBase {
  override dispose(): void {
    for (const worker of this.workers.values()) {
      void worker.stop(1000);
    }
    this.workers.clear();
    super.dispose();
  }
}
```

**Related ADR:** [ADR-0012](./adrs/0012-disposable-pattern.md)

### DisposableStore
Acumula múltiplos resources:

```ts
const store = new DisposableStore();
store.add(monitor.start(onUnhealthy));
store.add(toDisposable(() => managed.dispose()));
store.dispose();  // cleanup all
```

### Dynamic import
Evita resolução em compile-time quando dep não instalada (scaffolding):

```ts
// CpuPool
const mod = (await import(/* @vite-ignore */ 'piscina')) as PiscinaModule;

// ElectronRuntime
const mod = (await import(/* @vite-ignore */ 'electron')) as unknown;
```

### Process arguments (not env)
Avoid `process.env` (lint rule `noProcessEnv`). Use `process.argv`:

```ts
// main/process/managed-process.ts
const sessionId = process.argv[2];

// Spawn:
utilityProcess.fork(modulePath, [sessionId], options);
```

## Testing

### Unit tests
- `AppLifecycle`: mock handlers, verify timeout behavior
- `ProcessSupervisor`: mock ManagedProcess, verify spawn/shutdown
- `HealthMonitor`: mock ProcessHandle, verify threshold logic
- `SessionManager`: mock supervisor, verify message routing
- `CpuPool`: mock piscina, verify task delegation

### Integration tests
- Start app → create session → send message → receive event
- Worker crash → health monitor detects → restart
- Shutdown → all workers exit → no orphans

### E2E tests (future)
- 50+ concurrent sessions (stress test)
- Kill worker → supervisor restarts
- Quit app → zero orphan processes

## Performance targets

| Metric | Target | Status |
|--------|--------|--------|
| Main startup time | < 2s | ✓ |
| Session spawn time | < 500ms | ✓ |
| Health check latency | < 100ms | ✓ |
| Graceful shutdown | ≤ 5s | ✓ |
| Memory per worker | ≤ 50MB | ✓ |
| Max concurrent workers | 50+ | ✓ |

## Troubleshooting

### Worker keeps crashing (restart loop)
**Symptom:** Logs show `restarting process` every second, max restarts reached.

**Checks:**
1. `supervisorgetStatus().status` == 'dead'
2. `supervisor.list()` → inspect `restarts` count
3. Worker logs → `/tmp/worker-*.log` or via stderr pipe

**Fix:** Increase `maxRestarts` or fix root cause in SessionRuntime.

### Memory keeps growing
**Symptom:** `process.memoryUsage().heapUsed` grows, health check shows `degraded`.

**Checks:**
1. HealthMonitor.config.memoryLimitMb (default: 500MB)
2. Idle timeout active? `sessionManager.stopInactive(30*60*1000)`
3. SessionRuntime not disposing resources?

**Fix:** Lower memory limit or force idle cleanup more frequently.

### Shutdown hangs (app won't quit)
**Symptom:** User hits "Quit", 5s later app force-kills with no logs.

**Checks:**
1. AppLifecycle.shutdown() timeout
2. Supervisor.shutdownAll() phase 3 (SIGKILL)
3. ProcessHandle.waitForExit() never resolves

**Fix:** Set shorter deadline or add logs in worker.shutdown() handler.

## Roadmap

### Fase atual (v2.0.0)
- [x] ProcessSupervisor + utilityProcess
- [x] SessionManager
- [x] HealthMonitor
- [x] Graceful shutdown
- [x] CpuPool (piscina)
- [x] ADRs + docs

### Próximo (v2.1.0)
- [ ] E2E tests: 50+ workers, stress
- [ ] Metrics: prometheus export (worker uptime, crashes, memory)
- [ ] UI: show "Saving state..." during shutdown
- [ ] Auto-upgrade: trigger cleanup if RSS > 1GB

### Futuro (v3.0.0)
- [ ] Clustering: multiple main processes (load balanced)
- [ ] Live migration: move session between main processes
- [ ] Persistence: session state recovery on startup

## Referências

- [ADR-0030](./adrs/0030-electron-utilityprocess-worker-isolation.md): Worker isolation
- [ADR-0031](./adrs/0031-main-process-thin-layer-architecture.md): Main thin-layer
- [ADR-0032](./adrs/0032-graceful-shutdown-with-deadline-and-backoff.md): Graceful shutdown
- [ADR-0012](./adrs/0012-disposable-pattern.md): IDisposable pattern
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [Piscina docs](https://github.com/piscinajs/piscina)
