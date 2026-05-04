# GA Gates — G4 OS v2

**Última atualização:** 2026-04-30
**Spec de referência:** [TASK-15-01](../STUDY/Audit/Tasks/15-beta-to-ga/TASK-15-01-acceptance-criteria.md)
**Status:** Beta → GA — gates abertos
**Owner geral:** solo dev (todos os gates) — sign-off é self-review explícito em PR de release

Este documento é o **único checklist** para release GA. GA só sai quando **todos os 7 gates** estão verdes (✅) e o Go/No-Go check semanal aprova. Estado atual reflete a verdade do código + telemetria, não a aspiração.

| Símbolo | Significado |
|---|---|
| ✅ | Atende ao threshold |
| 🟡 | Em andamento / parcialmente atende |
| ⬜ | Não iniciado / sem medição |
| 🔴 | Falha — bloqueia GA |
| 🔵 | Adiado — não bloqueia GA (com justificativa) |

---

## Dashboard executivo

| Gate | Cobertura | Status | Bloqueador GA |
|---|---|---|---|
| **F** Funcionalidade | 5/10 features prontas | 🟡 | ⬜ não — depende de Onda 3 |
| **Q** Qualidade | 0 P0, ~3 P1 abertos | 🟡 | ⬜ tracker centralizado pendente |
| **P** Performance | 0/6 medidos | ⬜ | ⬜ — TASK-15-02 |
| **S** Estabilidade | sem dados Sentry | ⬜ | ⬜ — Sentry produção pendente |
| **Sec** Segurança | 4/7 baseline ok, pentest ⬜ | 🟡 | ⬜ — TASK-15-03 |
| **C** Compatibilidade | builds 3 OS ✅, smoke E2E 🟡 | 🟡 | ⬜ — Phase 13 testing |
| **D** Documentação | 2/6 prontos | 🟡 | ⬜ — migration guide pendente |

**Veredicto agora:** **No-Go**. Bloqueadores principais: features 04-12 (Onda 3), benchmarks (TASK-15-02), pentest (TASK-15-03), migration tooling (Epic 14).

---

## Gate F — Funcionalidade

Features que **precisam estar funcionais** em GA.

| # | Feature | Status | Referência |
|---|---|---|---|
| F1 | Chat básico (Claude + Codex + Pi/OpenAI/Google) | ✅ | Phase 07 (ADR-0070..73) |
| F2 | Sources MCP (stdio + HTTP) | ✅ | Phase 08 (ADR-0081..86) |
| F3 | Skills + workflows | ⬜ | 11-features/10-skills-workflows |
| F4 | Projects + workspaces | ✅ | 11-features/02 + 03 P0 |
| F5 | Marketplace (read + install) | ⬜ | 11-features/04-marketplace |
| F6 | Auto-update | ✅ | `update-service.ts` (Phase 12) |
| F7 | Auth (managed login + OTP) | ✅ | Phase 09 (ADR-0091..94) |
| F8 | Voice recording + transcription | ⬜ | 11-features/09-voice |
| F9 | Remote control V2 | ⬜ | 11-features/08-remote-control |
| F10 | Browser tool | ⬜ | 11-features/11-browser-tool |

**Status: 5/10 ✅, 5/10 ⬜** — Bloqueia GA. Onda 3 + 4 do CHECKPOINT cobrem F3, F5, F8, F9, F10.

---

## Gate Q — Qualidade

| Critério | Threshold | Status | Evidência |
|---|---|---|---|
| Bugs P0 abertos | 0 | ✅ | Sprint 0 fechou 5 BLOCKERs do CR12 |
| Bugs P1 abertos | < 5 | 🟡 | ~3 conhecidos sem tracker formal (10c-40 first-login, 10c-54 mutex static analysis, 10c-31 TranslationKey casts) |
| Bugs críticos do beta resolvidos | 100% | 🟡 | falta tracker centralizado |
| Code coverage | conforme TASK-13-06 | ⬜ | TASK-13 (testing strategy) ainda não iniciado |

**Pendência:** abrir tracker (GitHub Issues ou Linear) e migrar P1 conhecidos pra lá. Code coverage targets dependem de TASK-13-06.

---

## Gate P — Performance

| Métrica | Threshold | Status | Medição |
|---|---|---|---|
| Cold start time | p95 < 3s | ⬜ | 100 runs, sem dado |
| First message roundtrip | p95 < 500ms | ⬜ | local mock, sem dado |
| Memory resident (idle) | < 400MB | ⬜ | 1h sessão aberta, sem dado |
| Memory resident (10 sessões) | < 800MB | ⬜ | load test, sem dado |
| Bundle size (unpacked) | < 500MB | ⬜ | extrair do bundler report |
| Install size | < 250MB | ⬜ | medir installer artifact |

**Pendência:** **TASK-15-02 Performance benchmarks** (M) — define harness de medição, fixtures, CI integration. Sem isso, esse gate fica ⬜ permanentemente.

---

## Gate S — Estabilidade

| Critério | Threshold | Status | Fonte |
|---|---|---|---|
| Crash-free rate | > 99.5% (última semana) | ⬜ | Sentry produção — DSN não configurado em build packaged |
| Zero freezes reportados | 1 semana | ⬜ | tracker pendente |
| Session loss | < 0.1% | ✅ | event-sourced JSONL append-only garante (ADR-0010, 0043) |
| Zero credenciais perdidas em rollback | 100% | 🟡 | `CredentialVault` + 3 backups + atomic write (ADR-0050..53); rollback test ⬜ |

**Pendência:** configurar Sentry DSN em packaged builds, definir janela de medição, abrir issue tracker pra freezes. Rollback test pode ser script automatizado.

---

## Gate Sec — Segurança

| Critério | Threshold | Status | Evidência |
|---|---|---|---|
| Pentest externo concluído | sim | ⬜ | TASK-15-03 não iniciada |
| Findings P0/P1 resolvidos | 100% | ⬜ | depende de pentest |
| CSP strict habilitado | sim | ✅ | Debug HUD CSP restrito; main renderer revisar |
| `nodeIntegration` em renderer | desabilitado | ✅ | `webPreferences.nodeIntegration: false` em [window-manager.ts](../apps/desktop/src/main/window-manager.ts) |
| `contextIsolation` enforced | sim | ✅ | `webPreferences.contextIsolation: true` em todas as windows |
| `sandbox` em renderer | sim | ✅ | `webPreferences.sandbox: true` |
| Code signing válido 3 plataformas | sim | 🟡 | macOS notarized ✅, Windows ⬜, Linux ⬜ |
| SBOM gerado | sim | ⬜ | nenhum tooling configurado |

**Pendência:** **TASK-15-03 Security audit** (L) executa pentest e gera SBOM. Code signing Win/Linux conforme Epic 12 packaging.

---

## Gate C — Compatibilidade

| Critério | Threshold | Status | Evidência |
|---|---|---|---|
| macOS 12+ (arm64 + x64) | build + smoke | 🟡 | build OK; smoke E2E roda em arm64 (CI) |
| Windows 10+ (x64) | build + smoke | 🟡 | build OK pós-Phase 12; smoke E2E ⬜ |
| Ubuntu 22.04+ (x64) | build + smoke | 🟡 | build OK (deb/rpm/AppImage); smoke E2E ⬜ |
| 3 plataformas passam smoke E2E | sim | 🟡 | 5 smokes existem, mas só macOS ativo no CI |
| Auto-update testado nas 3 | sim | ⬜ | `electron-updater` integrado, end-to-end test ⬜ |

**Pendência:** matrix CI rodar smoke E2E em macOS + Windows + Linux. Auto-update test exige R2 staging bucket.

---

## Gate D — Documentação

| Documento | Status | Localização |
|---|---|---|
| User guide | ⬜ | TBD — `/docs/user-guide.md` |
| Release notes | ✅ | gerado por `pnpm changeset` (CI publica via `release.yml`) |
| Migration guide v1→v2 | ⬜ | depende de Epic 14 (Migration) |
| Dev docs (CONTRIBUTING) | 🟡 | `CLAUDE.md` + `AGENTS.md` cobrem boa parte; falta `CONTRIBUTING.md` formal |
| Architecture docs | ✅ | 155 ADRs em `docs/adrs/` + `docs/PROCESS-ARCHITECTURE.md` |
| FAQ + troubleshooting | ⬜ | TBD — `/docs/faq.md` |

**Pendência:** user guide e migration guide bloqueiam onboarding novos usuários. CONTRIBUTING.md útil pra contribuidores externos pós-GA.

---

## Processo de Go/No-Go

### Cadência

**Toda segunda-feira, ~15min** — self-review escrita. Forçar passo-pra-trás semanal evita inflar status por wishful thinking.

### Formato

1. Para cada gate, escrever 1-2 linhas: status atual + delta da semana + bloqueadores.
2. Decision matrix:
   - **Todos verdes** → Go (release window aberta).
   - **1+ amarelo** → No-Go com plano de ataque + ETA.
   - **1+ vermelho** → No-Go + ação imediata.
3. Output: snapshot do dashboard executivo (acima) atualizado neste arquivo + entry no `## Update log`.

### Onde registrar

- **Snapshot semanal**: append em `## Update log` no fim deste arquivo.
- **Mudança de gate** (⬜ → 🟡 → ✅): edit inline na tabela do gate + atualiza dashboard executivo.
- **Sign-off final**: PR no commit que muda dashboard pra todos ✅, aprovado em self-review.

### Sign-off para release

GA exige sign-off explícito em PR de release tag — single dev, single approve, mas **registrado** (não tag direto via CLI). O PR de release vira artefato auditável: descreve o estado de cada gate no momento do release + commits incluídos. Pós-GA, qualquer regressão fica trivialmente diff-ável contra o estado sign-off.

---

## Update log

### 2026-04-30 — Documento criado

- TASK-15-01 fechada com este checklist.
- Snapshot inicial: F=5/10, Q=🟡, P=⬜, S=⬜, Sec=🟡, C=🟡, D=🟡.
- Veredicto: **No-Go**. Próximo trabalho prioritário: TASK-15-02 (benchmarks), TASK-15-03 (security audit), Epic 14 (migration), Onda 3 features (F3, F5, F8, F9, F10).
- Próxima Go/No-Go review: **2026-05-04 (segunda-feira)**.
