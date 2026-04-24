# ADR-0145: No `utilityProcess`-per-session isolation in V2

- Status: Accepted
- Date: 2026-04-24
- Supersedes: ADR-0030 (electron utilityProcess worker isolation)

## Contexto

ADR-0030 especificou isolamento por `utilityProcess` por sessão como fix
estrutural para a Dor #2 do V1 (travamento por memória no Windows). A infra
foi implementada (`ProcessSupervisor`, `SessionManager`, `WorkerTurnDispatcher`,
`session-worker.ts`, `turn-runner.ts`, protocol tipado) mas ficou gated por
`G4OS_USE_SESSION_WORKER=1` — flag que nunca foi lida no dispatch.

Review arquitetural em 2026-04-24 identificou duas conclusões:

1. **A flag deixada desligada significa manter o bug V1 como opção.** Pior
   que não resolver: é resolver e condicionar a um env var que ninguém vai
   ligar em prod.

2. **As quatro causas raiz V1 da Dor #2 já estão cobertas sem worker-per-session:**

   | Causa raiz V1 | Fix estrutural em V2 |
   |---|---|
   | Main monolítico 1461 LOC / 151 arquivos | Main thin <6800 LOC, ≤300/arquivo, gate CI `check:main-size` |
   | `chokidar` vazando handles no Windows | `@parcel/watcher` obrigatório |
   | Listeners/timers/watchers sem cleanup | `DisposableBase` + `DisposableStore` enforcados, `ListenerLeakDetector` WeakRef |
   | Zero observabilidade de memória | `MemoryMonitor` com thresholds RSS/heap growth + `auditProcessListeners` |

Process isolation era **defense-in-depth**, não a causa raiz. VS Code,
Slack, 1Password rodam main monolítico com essas mesmas práticas e não
têm problema crônico de memória.

## Decisão

Remover `utilityProcess`-per-session como padrão arquitetural do V2.
Concretamente:

- Deletar `apps/desktop/src/main/workers/` (session-worker, turn-runner, protocol)
- Deletar `apps/desktop/src/main/services/worker-turn-dispatcher.ts`
- Deletar `apps/desktop/src/main/services/session-manager.ts`
- Deletar `apps/desktop/src/main/process/supervisor.ts`
- Deletar `apps/desktop/src/main/services/sessions/dispatcher-select.ts`
- Remover env var `G4OS_USE_SESSION_WORKER` e dual-dispatcher do `SessionsService`
- `TurnDispatcher` in-process vira o único caminho de dispatch

Piscina `CpuPool` permanece — threads para CPU-bound específicos
(transcription etc.) são um caso diferente, não session isolation.

## Consequências

**Positivas:**

- Zero código condicional/legado visível em V2. Um único caminho de
  dispatch, testado em todos os cenários.
- Main footprint menor (~500 LOC a menos sem session-manager + worker infra).
- Debug direto — turn execution inline no main, sem serialização IPC worker.
- Apresentação honesta do V2: "resolvemos Dor #2 estruturalmente" sem
  asterisco sobre feature gate desligada.

**Negativas:**

- Sem isolamento de crash por sessão: bug em agent/tool handler de uma
  sessão pode afetar o main. Mitigação: `AbortController` por turno,
  `MemoryMonitor` com thresholds, tool handlers retornam `Result<T, E>`.
- Se monitoramento detectar leak futuro, re-introduzir process isolation
  vira ADR novo + task dedicada, não flag de bolso.

## Alternativas consideradas

- **Manter a flag e completar o worker:** rejeitado. Worker está
  incompleto (não tem tool catalog, mount registry, permission broker),
  parity com `TurnDispatcher` é trabalho grande (semanas), e mesmo
  entregue a evidência empírica não mostra necessidade.
- **Manter o worker como scaffolding dormente:** rejeitado. Código morto
  no main rot rapidamente. Quando/se process isolation voltar a ser
  necessário, ressucitar de git é trivial; manter código não exercitado
  não é.

## Referências

- ADR-0030 (superseded) — decisão original de `utilityProcess` isolation
- ADR-0031 — main thin layer (ainda válido, piso <6800 LOC)
- ADR-0063 — memory monitoring (cobre observabilidade de memória)
- V1 `STUDY/Audit/analise-causas-e-solucoes.md` seção 2.2 (Dor #2)
