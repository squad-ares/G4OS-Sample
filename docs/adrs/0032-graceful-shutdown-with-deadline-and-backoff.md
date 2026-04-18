# ADR 0032: Graceful shutdown with deadline and backoff strategy

## Metadata

- **Numero:** 0032
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @squad-ares
- **Épico:** 03-process-architecture (TASK-03-06)

## Contexto

v1 quit flow had **orphan processes**:

1. **No signal before exit:** `app.exit()` immediately kills all workers
2. **No deadline:** workers hang indefinitely, then force-killed
3. **No backoff:** restarts immediate, hammering system on cascade failure
4. **No cleanup:** MCP subprocesses left running after app closes
5. **Race condition:** messages in flight lost, state corrupted

Real incidents:
- Session 1 writing to file when app quit → corrupted JSONL
- MCP subprocess kept running 30min after app closed (zombie)
- Restart loop: worker crashes, restarts, crashes again every 100ms

v2 objective: **signal → wait → kill**, with deadline + backoff.

## Opções consideradas

### Opção A: Graceful-first with deadline (adotada)
**Descrição:**
1. Signal `shutdown` to all workers with deadline (e.g., 5s)
2. Wait for graceful exit (process.exit(0))
3. Force SIGKILL after deadline
4. Exponential backoff on restart

```ts
// main/app-lifecycle.ts
app.on('before-quit', async (event) => {
  event.preventDefault();
  await this.shutdown(5000);  // 5s deadline
  app.exit(0);
});

// main/process/supervisor.ts
async shutdownAll(timeoutMs = 5000) {
  // 1. Signal graceful shutdown
  for (const p of this.processes.values()) {
    p.postMessage({ type: 'shutdown', reason: 'app-quit' });
  }
  
  // 2. Wait or timeout
  const results = await Promise.allSettled(
    Array.from(this.processes.values()).map((p) =>
      Promise.race([
        p.waitForExit(),
        timeoutMs(timeoutMs),
      ])
    ),
  );
  
  // 3. Force kill stuck
  const stuck = results.filter((r) => r.status === 'rejected');
  for (const p of stuck) p.forceKill();
}

// main/workers/session-worker.ts
process.parentPort!.on('message', (msg) => {
  if (msg.type === 'shutdown') {
    await runtime.flushInFlight(3000);
    await runtime.saveState();
    process.exit(0);
  }
});
```

**Pros:**
- Workers have chance to flush buffers
- Deadline prevents hang (always exit)
- SIGKILL only as last resort
- Parent always exits cleanly
- Data integrity: flush before exit

**Contras:**
- Complexity: 3-phase shutdown
- Slow case: 5s wait might feel long to user

**Custo de implementação:** M (2-3 dias, coordination)

### Opção B: Immediate hard kill
**Descrição:**
Just call `process.exit(1)` immediately.

```ts
app.on('before-quit', () => process.exit(0));
```

**Pros:**
- Simple, fast

**Contras:**
- Orphan processes (workers keep running)
- Data loss (unsaved state, in-flight messages)
- Cascading failures (MCP zombies, zombie sessions)
- Corruption (partial writes to disk)

**Custo de implementação:** ✗ (negative)

### Opção C: Timeout-only (no graceful)
**Descrição:**
Wait for processes but no signal. Just kill after timeout.

```ts
const allExited = await Promise.race([
  Promise.all(processes.map(p => p.waitForExit())),
  sleep(5000),
]);
if (!allExited) processes.forEach(p => p.kill());
```

**Pros:**
- Simple, still has timeout

**Contras:**
- No flush opportunity: processes don't know to clean up
- Data loss: same as Opção B
- Workers hang, then killed (bad logs)

**Custo de implementação:** S (1 dia, but ineffective)

## Decisão

Optamos pela **Opção A (Graceful-first with deadline)** porque:

1. **Data safety:** workers get 3s to flush in-flight
2. **Robustness:** deadline prevents hang (always exit ≤ 5s)
3. **Debugging:** logs show intentional shutdown, not crash
4. **User experience:** app quits when they ask, with cleanup
5. **Orchestration:** cascading cleanup (session → MCP)

## Implementação

### Phase 1: Signal (immediate)
```ts
// main/app-lifecycle.ts
app.on('before-quit', (event) => {
  event.preventDefault();
  this.shutdown().finally(() => app.exit(0));
});

async shutdown(timeoutMs = 5000) {
  log.info('shutdown initiated');
  
  // Handlers registered with onQuit() run here
  const results = await Promise.allSettled(
    this.shutdownHandlers.map(h =>
      Promise.race([
        Promise.resolve(h()),
        timeoutRejection(timeoutMs),
      ])
    ),
  );
  
  const errors = results.filter(r => r.status === 'rejected');
  if (errors.length > 0) {
    log.warn({ count: errors.length }, 'handlers exceeded deadline');
  }
}
```

### Phase 2: Supervisor shutdown
```ts
// main/process/supervisor.ts
async shutdownAll(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  
  // Phase 2a: signal graceful shutdown
  for (const p of this.processes.values()) {
    p.postMessage({ type: 'shutdown', reason: 'app-quit' });
  }
  
  // Phase 2b: wait for exit or deadline
  const results = await Promise.allSettled(
    Array.from(this.processes.values()).map((p) =>
      Promise.race([
        p.waitForExit(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('deadline')), Math.max(0, deadline - Date.now()))
        ),
      ])
    ),
  );
  
  // Phase 2c: force kill stragglers
  const stuck = results.filter((r) => r.status === 'rejected');
  if (stuck.length > 0) {
    log.warn({ count: stuck.length }, 'force killing stuck processes');
    for (const p of this.processes.values()) {
      p.forceKill();
    }
  }
}
```

### Phase 3: Worker cleanup
```ts
// apps/desktop/src/main/workers/session-worker.ts
process.parentPort!.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    log.info({ reason: msg.reason ?? 'unknown' }, 'worker shutting down');
    
    try {
      // 3a: Stop accepting new messages
      stopAcceptingRequests();
      
      // 3b: Await in-flight messages (max 3s)
      await flushInFlight(3000);
      
      // 3c: Persist state
      await saveState();
      
      // 3d: Cleanup resources
      await dispose();
    } catch (err) {
      log.error({ err }, 'error during flush');
    }
    
    process.exit(0);
  }
});
```

### Backoff strategy on restart
```ts
// main/process/managed-process.ts
private async onExit(code: number | null) {
  const maxRestarts = 2;
  const crashed = code !== 0 && code !== null;
  
  if (this.restartCount >= maxRestarts) {
    log.error('max restarts reached; giving up');
    return;
  }
  
  // Exponential backoff: 1s, 2s, 4s, ...
  const base = 1_000;
  const backoff = base * (2 ** this.restartCount);
  
  log.info({ backoffMs: backoff }, 'restarting worker');
  await sleep(backoff);
  this.restartCount++;
  await this.start();
}
```

## Signals

### SIGINT / SIGTERM
```ts
// main/app-lifecycle.ts
process.on('SIGINT', () => this.app.quit());
process.on('SIGTERM', () => this.app.quit());
```

Triggers same `before-quit` → graceful shutdown flow.

## Consequências

### Positivas
- **Data integrity:** flush before exit, state saved
- **Cleanup:** MCPs closed, workers exit cleanly
- **Predictable:** app always exits in ≤ 5s
- **Debugging:** logs show shutdown flow, not mystery crashes
- **Cascading:** session cleanup → MCP cleanup
- **Testing:** can mock graceful shutdown, verify flush was called

### Negativas / Trade-offs
- **Slow on bad path:** 5s wait feels long if worker stuck
  - Mitigation: health monitor restarts unhealthy workers early
- **Complexity:** 3 phases + deadline coordination
  - Mitigation: AppLifecycle hides complexity from callers
- **User perception:** "Quit is slow" if many workers
  - Mitigation: show "saving state" UI during shutdown (future)

### Neutras
- SIGKILL only used when graceful fails (rare case)
- Backoff prevents restart loops (common failure mode)

## Testing strategy

### Unit tests
- `AppLifecycle.shutdown()` with mocked handlers (timeout after X ms)
- `ProcessSupervisor.shutdownAll()` with mock ManagedProcess (verify signal sent)
- `ManagedProcess.onExit()` backoff calculation (verify exponential)

### Integration tests
- Start app → quit → verify all workers exited (ps aux)
- Start app → SIGTERM → verify graceful (logs show shutdown)
- Restart loop: worker crashes 3x → verify stops (max restarts)
- Timeout: worker hangs → verify force-kill after 5s

### E2E tests (future)
```ts
test('app quit leaves no orphan processes', async () => {
  const app = await launchApp();
  const pidsBefore = await getChildPids(app.pid);
  
  await app.close();
  await sleep(2000);
  
  const pidsAfter = await getChildPids(app.pid);
  expect(pidsAfter).toHaveLength(0);
});

test('graceful shutdown flushes state', async () => {
  const app = await launchApp();
  const session = await app.createSession();
  await session.sendMessage('hello');
  
  // Before quit: message in queue
  expect(await session.getPendingCount()).toBe(1);
  
  await app.close();  // Quit → flush
  
  // After quit: state saved
  const reloaded = await launchApp();
  const reopened = await reloaded.openSession(session.id);
  expect(await reopened.getState()).toMatchObject({ messageCount: 1 });
});
```

## Histórico de alterações

- 2026-04-18: Proposta inicial
- (pendente) Aceita pelo time
- (pendente) E2E tests implementados

## Referências

- ADR-0030: Electron utilityProcess worker isolation
- [Node.js process.exit docs](https://nodejs.org/api/process.html#process_process_exit_code)
- [Signal handling in Node.js](https://nodejs.org/api/process.html#process_signal_events)
- [Graceful shutdown patterns](https://github.com/sindresorhus/got/blob/main/source/core/utils/is-request-timeout.ts)
