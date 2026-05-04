# Security audit prep — G4 OS v2

Material a fornecer ao vendor de pentest antes do kick-off (TASK-15-03).
Reduz tempo de ramp do auditor + força clareza interna sobre o que
queremos validar vs ao que aceitamos como out-of-scope.

## Escopo proposto

| Camada | Em escopo | Out-of-scope (justificativa) |
|---|---|---|
| Electron hardening | CSP, contextIsolation, preload surface, IPC | — |
| Credentials | safeStorage, vault mutex, backups, migrator V1→V2 | keytar (banido em ADR-0050) |
| Agent execution | tool permissions, sandbox, command injection em handlers | LLM provider security (Anthropic/OpenAI/Google) |
| Sources/MCP | OAuth flows, token storage, scope enforcement, MCP stdio sandbox | MCP servers individuais (responsabilidade upstream) |
| Auto-update | signature verify, downgrade attack, MITM | infra Sentry/PostHog (SaaS auditados separadamente) |
| Network | TLS config, cert pinning (se aplicável) | — |
| Supply chain | lockfile integrity, postinstall scripts | npm registry trust (responsabilidade pnpm) |
| Telemetria | PII leakage, scrub Sentry, opt-in PostHog | analytics aggregations downstream |

## Arquitetura

Documentos primários para o auditor:

1. **[`/CLAUDE.md`](../../CLAUDE.md)** — visão geral, stack, ADRs de decisão.
2. **[`/docs/PROCESS-ARCHITECTURE.md`](../PROCESS-ARCHITECTURE.md)** —
   processos, IPC, lifecycle.
3. **[`/docs/adrs/`](../adrs/)** — decisões aceitas (imutáveis), em
   especial:
   - ADR-0050 — `CredentialVault` gateway
   - ADR-0051 — backup rotation 3x + escrita atômica
   - ADR-0052 — migrador V1→V2 idempotente
   - ADR-0053 — `RotationOrchestrator`
   - ADR-0062 — Sentry scrub central
   - ADR-0063 — `MemoryMonitor` + `ListenerLeakDetector`
   - ADR-0072 — CodexAgent subprocess via NDJSON
   - ADR-0086 — MCP stdio runtime mode policy
   - ADR-0145 — process isolation rejeitada (substitui ADR-0030)
4. **[`/docs/security/threats.md`](threats.md)** — threat model.
5. **[`/sbom.json`](../../sbom.json)** — SBOM CycloneDX (gerar via
   `pnpm security:sbom`).

## Credenciais

- **Vault**: Electron `safeStorage` nativo (Keychain macOS / DPAPI Windows /
  libsecret Linux). Wrapper único `CredentialVault` (`packages/credentials/src/vault.ts`).
- **Concorrência**: mutex FIFO; reads bloqueiam writes.
- **Backup**: 3x rotativos (`credentials.enc.bak.{1,2,3}`). Escrita
  atômica `write tmp → fsync → rename`. ADR-0051.
- **Migração V1→V2**: dedicada (`packages/credentials/src/migration/`).
  Idempotente, não-destrutiva, dry-run support. ADR-0052.
- **Banido**: `keytar` (Atom team arquivou). Não entrar via dep transitiva.

## Build reproducibility

- Lockfile (`pnpm-lock.yaml`) committed.
- `engines.node = >= 24.0.0` força versão consistente.
- `engines.pnpm = ^10.33.0` força package manager consistente.
- Build determinístico via tsup + Vite — mesmo input → mesmo output.
- SBOM: `pnpm security:sbom` gera `sbom.json` via CycloneDX.

## IPC surface

- tRPC v11 router único em [`packages/ipc/src/server/`](../../packages/ipc/src/server/).
- Cada procedure tem schema Zod (input + output validation).
- `electron-trpc` over `ipcMain.on(ELECTRON_TRPC_CHANNEL)` — wrapper
  customizado em `electron-ipc-handler.ts`.
- Sem `ipcMain.handle` solto. Sem `webContents.send` direto exceto pelo
  EventBus + IPC bridge documentado.
- Preload script com `contextBridge` — ver
  [`apps/desktop/src/preload.ts`](../../apps/desktop/src/preload.ts).

## Trace propagation

- W3C `traceparent` propagado renderer→main (TASK-10B-13a).
- Permite correlacionar spans cross-process — útil pro auditor entender
  fluxo end-to-end.
- Sentry `beforeSend` scrubba PII via `scrubSentryEvent` (ADR-0062).

## Itens deliberadamente NÃO feitos (por enquanto)

- Cert pinning: deferido — auto-update via electron-builder usa cert do
  installer (signed) + GitHub release URL (HTTPS). Pinning adiciona
  fragilidade sem ganho claro pra ameaça atual.
- Sandbox renderer estrito (`sandbox: true`): renderer atualmente roda
  com `sandbox: false` por causa de IPC bridge complexo. Avaliar
  depois do audit — possível recomendação de hardening.
- Process isolation por sessão: rejeitado em ADR-0145 (substitui
  ADR-0030). Main thin + DisposableBase + MemoryMonitor + parcel/watcher
  cobrem as 4 causas raiz V1.

## Triagem prevista

| Severidade | SLA fix | Bloqueia GA? |
|---|---|---|
| P0 — RCE, credential exposure | Imediato | Sim |
| P1 — privilege escalation, auth bypass | Antes GA | Sim |
| P2 — info disclosure, hardening gaps | 30d pós-GA | Não |
| P3 — best practice | Backlog | Não |

## Vendor candidates

(em ordem alfabética)

- Cure53 — Electron expertise documentada.
- Doyensec — JS/Node forte, preço médio.
- NCC Group — escopo amplo, preço alto.
- Trail of Bits — top-tier, fila longa.

Budget esperado: $20-40k (Electron médio).

## Referências

- TASK-15-03 em `STUDY/Audit/Tasks/15-beta-to-ga/`
- [`threats.md`](threats.md) — threat model
- [`findings.md`](findings.md) — template de tracking de findings
- [`security.md`](../../security.md) — política pública (criar pós-GA)
