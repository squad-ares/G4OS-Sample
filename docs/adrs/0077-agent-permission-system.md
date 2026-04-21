# ADR 0077: Permission system — três modos + remember store + queue não-bloqueante

## Metadata

- **Numero:** 0077
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-07-06 (epic 07-agent-framework)

## Contexto

A V1 tinha lógica de permissões espalhada em três arquivos distintos:
- `packages/shared/src/agent/permissions-config.ts` — listas de tools que requerem aprovação
- `packages/shared/src/agent/mode-manager.ts` — estados de modo (allow-all, ask, safe)
- `packages/pi-agent-server/src/index.ts` — handling de `permission_request`/`permission_response` via NDJSON entre processos

Problemas resultantes:
1. **Modal bloqueava a fila de IPC**: enquanto o usuário não respondia, o processo filho do Pi ficava bloqueado em um `await Promise` que nunca resolvia (sem timeout)
2. **Não havia scope de remember**: a única granularidade era "session" — não existia "once" nem "always"
3. **Safe mode allowlist** era definida em runtime via config mutável, dificultando auditoria de segurança

Requisitos:
- Três modos: `allow-all`, `ask`, `safe`
- Safe mode com allowlist configurável (read-only, imutável em runtime)
- Remember scope: `once` (não persiste), `session` (persiste até restart), `always` (persiste em disco)
- Modal não-bloqueante: a UI recebe a request via subscription tRPC e responde via mutation — o worker não fica bloqueado
- Cobertura de testes ≥ 90% (domínio crítico de segurança)

## Opções consideradas

### Opção A: manter blocking Promise no worker

O agent await uma Promise que só resolve quando o usuário responde. Simples de raciocinar.

**Rejeitado**: O renderer pode estar travado, minimizado, ou o usuário pode demorar minutos. Nesse tempo o worker bloqueia, nenhum outro evento do agente é processado, e o stream LLM pode sofrer timeout do lado do servidor.

### Opção B: PermissionQueue + resolver não-bloqueante + tRPC subscription (escolhido)

`PermissionQueue` recebe requests, atribui IDs, e armazena `(requestId -> resolver)`. A queue expõe:
- `enqueue(request)` — retorna Promise que resolve quando `decide()` for chamado
- `decide(requestId, decision)` — resolve a Promise (chamado pelo renderer via tRPC mutation)
- `onRequest(listener)` — notifica o renderer via tRPC subscription (SSE)
- `dispose()` — nega todas as requests pendentes com `reason: 'queue_disposed'`

O `DefaultPermissionResolver` encapsula a lógica de modos:
1. Verifica `PermissionRememberStore` (decisões anteriores)
2. Se `allow-all` → allow imediato
3. Se `safe` → consulta `classifyForSafeMode()` (allowed/forbidden/unknown)
4. Se `ask` ou `unknown` → enfileira na queue e aguarda UI

### Opção C: timeout automático com deny após N segundos

Após 30s sem resposta, deny automático.

**Considerado como complemento**, não como opção alternativa. Pode ser adicionado como middleware em `PermissionQueue.enqueue` em sprint futuro sem mudar a interface.

## Decisão

Opção B. Toda a lógica de permissão vive em `@g4os/agents/permissions` com subpath export. O wiring com tRPC fica na camada IPC (fora do pacote de agents — conforme ADR-0020).

## Consequências

**Positivas:**
- Worker jamais bloqueia por aguardar resposta do usuário
- `PermissionQueue.dispose()` garante que sessions encerradas não deixem Promises penduradas
- `safe` mode allowlist é imutável em runtime — auditável estaticamente
- `DefaultPermissionResolver` é testável sem UI real (DI por `PermissionUI` interface)

**Neutras:**
- `PermissionRememberStore` é uma interface — implementação em memória suficiente para V2 inicial; persistência em SQLite fica para sprint de sessions
- O renderer precisa subscrever à queue via tRPC antes de iniciar o turn — ordem de operações deve ser documentada no wiring

**Negativas:**
- Complexidade extra vs. blocking Promise simples — justificada pela garantia de não-bloqueio
- `decide()` retorna `false` silenciosamente se `requestId` não existe (request expirada) — consumidor deve tratar

## Estrutura implementada

```
packages/agents/src/permissions/
├── types.ts              # PermissionMode, PermissionRequest, PermissionDecision
│                         # PermissionUI, PermissionRememberStore, PermissionResolver
├── safe-allowlist.ts     # classifyForSafeMode() → 'allowed'|'forbidden'|'unknown'
│                         # SAFE_MODE_ALLOWED_TOOLS, SAFE_MODE_FORBIDDEN_TOOLS (ReadonlySet)
├── default-resolver.ts   # DefaultPermissionResolver implements PermissionResolver
├── queue.ts              # PermissionQueue extends DisposableBase
└── index.ts              # barrel export
```

O wiring tRPC (subscription `permissions.pending` + mutation `permissions.decide`) fica em `packages/ipc/src/server/routers/` — fora deste pacote.

## Armadilhas preservadas da V1

1. V1: `pendingPermissionRequests` era um `Map` global no processo — sem limpeza em shutdown. V2: `PermissionQueue.dispose()` nega tudo.
2. V1: safe mode era definido por config mutável em runtime, possibilitando escalar permissões. V2: `SAFE_MODE_FORBIDDEN_TOOLS` é `ReadonlySet` const, imutável.
3. V1: não havia `once` scope — tudo era `session`. V2: `once` é o default para não poluir o `RememberStore` com decisões pontuais.

## Referências

- ADR-0020 (IPC tRPC — wiring do subscription)
- ADR-0070 (plugin architecture)
- TASK-07-06
- `packages/shared/src/agent/permissions-config.ts` da V1 (referência de allowlist)
