# ADR 0134: @g4os/permissions package — tool-use PermissionBroker + PermissionStore

## Metadata

- **Numero:** 0134
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-09 (tool use + permissions, Phase 1 + 2)

## Contexto

OUTLIER-09 trouxe tool use agent-driven ao v2. Para cada `tool_use` emitido pelo agent, o main precisa mediar permissão do usuário (`allow_once` / `allow_session` / `allow_always` / `deny`), persistir decisões `allow_always` por workspace e expor IPC pra settings revogar. Inicialmente a implementação ficou em `apps/desktop/src/main/services/permission-broker.ts` + `permissions/permission-store.ts` (389 LOC somados). Isso pressionou o gate `check:main-size` que tinha subido pra 6200 LOC.

Restrições:

1. Main continua `thin` (ADR-0031 — cap 6200 LOC, cada arquivo ≤300). Deixar broker+store em main quebrava o cap e obrigava a elevar novamente.
2. Broker e store são lógica pura (sem Electron IPC, sem drizzle, sem rxjs) — cabem em package isolado.
3. Tool-use policy é cross-cutting: tanto `TurnDispatcher` quanto `WorkerTurnDispatcher` precisam do mesmo broker. Duplicar em cada um violaria DRY.
4. Tests próprios do broker + store não existiam — empurrar pra package também resolve "onde tests ficam".

## Opções consideradas

### Opção A: Manter em main, elevar MAIN_LIMIT
**Pros:** zero mudança estrutural.
**Contras:** gate perde força (fácil ir de 6200 → 7200 → 8000). Viola "forcing functions primeiro" (ADR-0031). Tests teriam que ir em `apps/desktop/src/main/services/__tests__/` — complica import de broker isolado.

### Opção B: Hospedar em `@g4os/agents/permissions` (subpath existente)
**Pros:** evita novo package; subpath já existe com `queue.ts`, `default-resolver.ts`, `types.ts`.
**Contras:** o contract em `@g4os/agents/permissions` é agent-internal (resolver chamado de dentro do runner). Broker+store são composition-level — misturam camadas. Cruiser rule `agents-interface-isolated` permite só kernel como dep — OK aqui, mas conceitualmente errado.

### Opção C: Novo package `@g4os/permissions` (aceita)
**Descrição:**
- `packages/permissions/src/permission-broker.ts` — `PermissionBroker extends DisposableBase` (ADR-0012), Deferred queue + in-memory `allow_session` cache + integração opcional com `PermissionStore` via `{ store?: PermissionStore }` constructor arg.
- `packages/permissions/src/permission-store.ts` — JSON atômico por workspace (`permissions.json`), chave `(toolName, argsHash)`, `hashArgs` = SHA-256 hex completo (64 chars) sobre JSON ordenado. Accept-legacy: `find()` aceita hash truncado 32-char pra compat com arquivos pré-2026-04-24.
- `packages/permissions/package.json` com cruiser rule `permissions-isolated` — deps apenas em `@g4os/kernel`.

## Decisão

**Opção C.** Novo pacote `@g4os/permissions` exporta `PermissionBroker`, `PermissionStore`, `PermissionDecision`, `hashArgs`.

## Consequências

### Positivas
- Main cai 381 LOC (permission-broker 225 + permission-store 156). Combinado com as outras extrações (session-runtime, sources subpaths), main passou de 7987 → 5976 LOC sem elevar MAIN_LIMIT.
- Broker/store viram dep isolada — TurnDispatcher (in-process) e WorkerTurnDispatcher (worker path) compartilham a mesma instância via injection.
- Boundary enforcement (cruiser `permissions-isolated`): `permissions` só depende de `kernel`. Impossível acoplar com main acidentalmente.
- Tests específicos do broker ficam no pacote (`packages/permissions/src/__tests__/`), isolados.

### Negativas / Trade-offs
- Mais um package pra gerenciar (tsup config, tsconfig, lockfile entry). Overhead é real mas constante.
- Broker estava bem acoplado ao composition root de main. Movê-lo requeriu interface estável — o callback `onRequest: (req) => void` resolve mas quebra o encapsulamento "um único lugar que emite permission_required".

### Neutras
- Migration de hashes argsHash 32-char → 64-char é transparente: `find()` aceita ambos, novos writes sempre full. Elimina risco de colisão sem quebrar usuários existentes.

### Comportamentos reforçados (CR3-07/08, 2026-04-26)

- **`PermissionBroker.request()` coalesce concurrent.** Duas chamadas
  para mesmo `(sessionId, toolName, argsHash)` enquanto a primeira ainda
  está pendente reaproveitam o mesmo `Promise<PermissionDecision>`.
  Antes, cada chamada criava um Deferred separado e emitia
  `turn.permission_required` duplicado — UI podia mostrar dois prompts
  modais idênticos, e cancelar um deixava o outro pendurado. Agora há
  um `#coalesce: Map<coalesceKey, Promise>` indexado pelo trio acima;
  o slot é limpo determinísticamente em `respond()` / `cancel()` /
  `dispose()` (sem `.finally` pra evitar unhandled rejections).
- **`PermissionStore.list()` e `find()` rodam dentro de `withLock`.**
  Sem o lock, leitura concorrente com `persist()`/`revoke()` em curso
  podia retornar snapshot pré-`writeAtomic` (FS rename é atômico, mas
  a leitura ocorre antes do rename). Agora reads e writes serializam
  por workspace, garantindo "leitura sempre pós-último write commitado".

## Validação

- `check:main-size` passa com 5976/6200 LOC.
- `check:cruiser` `permissions-isolated` enforcada.
- Tests pra `PermissionBroker` (request/respond/cancel/dispose/store lookup) + `PermissionStore` (atomic write, ENOENT default, revoke, clearAll, hash stability) vão em FOLLOWUP-14.
- Manual smoke: `TurnDispatcher` consumindo `@g4os/permissions` end-to-end — permission modal no session page dispara, usuário responde, broker persiste `allow_always` no JSON.

## Referencias

- ADR-0031 (main process thin layer)
- ADR-0012 (disposable pattern)
- TASK-OUTLIER-09 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita junto com extração do session-runtime.
- 2026-04-26: `PermissionBroker.request()` coalesce concurrent requests
  pelo trio `(sessionId, toolName, argsHash)`; `PermissionStore.list/find`
  passam a executar dentro do `withLock` para garantir consistência
  pós-write. 5 testes novos. CR3-07 + CR3-08.
