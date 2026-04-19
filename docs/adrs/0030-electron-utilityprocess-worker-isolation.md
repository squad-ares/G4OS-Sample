# ADR 0030: Electron utilityProcess for worker isolation

## Metadata

- **Numero:** 0030
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 03-process-architecture (TASK-03-02, TASK-03-03, TASK-03-04, TASK-03-06)

## Contexto

v1 arquitetura tinha **one big Node process**:

1. **Sessões na main thread:** travamento em uma sessão paralisa UI
2. **Memory accumulation:** GC node.js lento; 50+ sessões = OOM
3. **Cascading failures:** MCP crash em uma sessão trava app todo
4. **Debugging nightmare:** stacktraces misturados, sem isolamento

Exemplos de problemas reais em v1:
- Session 1 parsing JSONL grande → main thread bloqueado por 30s
- Session 2 MCP WebSocket hang → app não responde a cliques
- Memory cresceu para 2GB com apenas 20 sessões abertas

v2 objetivo: **cada sessão isolada em processo próprio**, como navegador multi-tab.

## Opções consideradas

### Opção A: Electron utilityProcess (adotada)
**Descrição:**
Usar `app.utilityProcess.fork()` para spawnar worker nodes isolados. Main coordena via IPC.

```ts
// main/process/supervisor.ts
const worker = runtime.utilityProcess.fork(
  './src/main/workers/session-worker.js',
  [sessionId],  // via argv, nao env
  { stdio: 'pipe' }
);

worker.on('message', (msg) => {
  if (msg.type === 'session-event') emit(msg.event);
});

worker.postMessage({ type: 'send-message', payload });
```

**Pros:**
- Process isolation: um worker crash não afeta main/outros workers
- Memory pressure: kill worker = tudo liberado (não depende de GC)
- Electron-native: já integrado, sem dependências extras
- Debugging: chrome devtools por PID
- Scaling: sistema OS controla scheduling entre workers

**Contras:**
- Overhead de processo (15-20MB por worker vs 2-3MB por thread)
- IPC overhead: serialização JSON nas boundaries
- Gerenciamento: supervisor precisa lidar com crashes, restarts, timeouts

**Custo de implementação:** M (3-4 dias, ProcessSupervisor + HealthMonitor)

### Opção B: Node.js Worker Threads (piscina)
**Descrição:**
Usar `worker_threads` em pool (piscina) para sessions.

```ts
import Piscina from 'piscina';
const pool = new Piscina({
  filename: './workers/session-worker.js',
  minThreads: 2,
  maxThreads: 8,
});
```

**Pros:**
- Menor overhead (2-3MB vs 15-20MB)
- Compartilham heap (mais eficiente para dados pequenos)
- Simples de setup: piscina cuida de pool management

**Contras:**
- Ainda na main process: GC slowdown, memory pressure global
- Shared V8 isolate = potential race conditions
- Less robust: thread OOM != process exit, cascading failures possível
- Debugging harder: sem chrome devtools integration

**Custo de implementação:** S (1-2 dias, só wrapper piscina)

### Opção C: Hybrid (utilityProcess + Worker Threads)
**Descrição:**
Sessions em utilityProcess; CPU-heavy tasks (parsing, rendering) em worker threads dentro do supervisor.

```ts
// main/process/supervisor.ts (utilityProcess for sessions)
const sessionWorker = utilityProcess.fork('./session-worker.js');

// apps/desktop/src/main/services/cpu-pool.ts (piscina inside main)
const cpuPool = new Piscina({
  filename: './workers/cpu-pool/tasks.js',
  maxThreads: 4,
});
```

**Pros:**
- Sessions isoladas (utilityProcess)
- CPU tasks parallelized sem multi-process overhead (piscina)
- Best of both worlds

**Contras:**
- More complex: zwei systems to manage
- Learning curve: devs need to know when to use which

**Custo de implementação:** L (4-5 dias, full integration)

## Decisão

Optamos pela **Opção C (Hybrid: utilityProcess + piscina)** porque:

1. **Robustness:** Session isolation via processes, cpu-heavy task parallelism via threads
2. **Scaling:** 50+ concurrent sessions feasível; CPU tasks não bloqueiam main
3. **Memory:** Process death = full cleanup; threads share heap = efficient
4. **Debugging:** Sessions in chrome devtools; pools in node inspect
5. **Precedent:** V1 failing pattern (all in main) → V2 learning (isolate critical paths)

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process (thin: < 2000 LOC)           │
│  - AppLifecycle (quit, SIGINT/SIGTERM)             │
│  - WindowManager (BrowserWindow CRUD)              │
│  - ProcessSupervisor (spawn/manage utilityProcess) │
│  - SessionManager (route IPC → worker)             │
│  - CpuPool (piscina wrapper)                       │
└─────────────────────────────────────────────────────┘
         ↓ IPC (postMessage/on)
    ┌─────────────────────────────────────────────────────┐
    │ Session Worker 1..N (utilityProcess)                │
    │  - sessionId via argv[2] (not env)                 │
    │  - handles send-message, interrupt, health-check   │
    │  - emits session-event back to main                │
    │  - graceful shutdown: flush → exit(0)              │
    └─────────────────────────────────────────────────────┘
         ↓ IPC (CPU task delegation)
    ┌─────────────────────────────────────────────────────┐
    │ CPU Thread Pool (piscina: 2-8 threads)             │
    │  - parseJsonlFile, renderMarkdownBatch, compress   │
    │  - non-blocking main thread                        │
    └─────────────────────────────────────────────────────┘
```

## Consequências

### Positivas
- **Process isolation:** one worker crash ≠ app crash
- **Memory predictable:** kill worker frees all resources
- **Scaling:** OS schedules 50+ workers without contention
- **Debugging:** PID-based chrome devtools per worker
- **Graceful degradation:** slow worker doesn't block main
- **Testing:** spawn fake workers, mock IPC, fully testable

### Negativas / Trade-offs
- **Memory overhead:** 15-20MB per worker (vs 2-3MB per thread)
  - Mitigation: idle timeout (30min) kills inactive sessions
- **IPC latency:** serialization overhead on boundaries
  - Mitigation: batch messages, keep payloads small
- **Restart complexity:** supervisor handles crashes + backoff
  - Mitigation: health checks every 30s, max 2 restarts per session
- **Learning curve:** devs must understand worker lifecycle
  - Mitigation: clear examples, SessionManager + HealthMonitor abstractions

### Neutras
- CPU pool separate from session workers: two systems to manage
  - But both follow same IDisposable pattern, consistent

## Implementação

### TASK-03-02: ProcessSupervisor + HealthMonitor
- `apps/desktop/src/main/process/types.ts`: ProcessHandle, SpawnConfig
- `apps/desktop/src/main/process/managed-process.ts`: wraps utilityProcess lifecycle
- `apps/desktop/src/main/process/health-monitor.ts`: periodic pings, restart on degraded
- `apps/desktop/src/main/process/supervisor.ts`: orchestrate spawn/list/shutdownAll

### TASK-03-03: SessionManager
- `apps/desktop/src/main/services/session-manager.ts`: SessionManager class
- `apps/desktop/src/main/workers/session-worker.ts`: worker entry point
- Route: main IPC → sessionManager.sendMessage() → worker.postMessage()

### TASK-03-04: CpuPool
- `apps/desktop/src/main/services/cpu-pool.ts`: Piscina wrapper
- `apps/desktop/src/main/workers/cpu-pool/tasks.ts`: exported task functions
- Dynamic import to keep @g4os/desktop typeable before `piscina` installed

### TASK-03-06: Graceful Shutdown
- `apps/desktop/src/main/app-lifecycle.ts`: AppLifecycle class + handlers
- Signal SIGINT/SIGTERM → `app.quit()` → lifecycle.shutdown()
- Supervisor.shutdownAll(5s): signal → wait → SIGKILL stuck

## Validação

- [x] Typecheck: tsc --noEmit (no errors)
- [x] Lint: biome check (no errors)
- [x] Architecture gates: check:circular, check:boundaries (no violations)
- [x] Main size: < 2000 LOC total, ≤ 300 per file
- [x] Process supervisor starts/restarts workers
- [ ] Health monitor triggers restart on degraded (testing)
- [ ] 50+ concurrent sessions without OOM (e2e test)
- [ ] Worker crash doesn't crash main (e2e test)
- [ ] Graceful shutdown kills all workers in ≤ 5s (e2e test)
- [ ] Idle timeout removes workers after 30min (e2e test)

## Histórico de alterações

- 2026-04-18: Proposta inicial
- (pendente) Aceita pelo time
- (pendente) Implementação completa e validação em e2e

## Referências

- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Piscina docs](https://github.com/piscinajs/piscina)
- ADR-0012: Disposable pattern (used in health monitor, session manager)
- ADR-0013: Platform abstraction (electron-runtime.ts)
