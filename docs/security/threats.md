# Threat model — G4 OS v2

Catálogo de ameaças identificadas + mitigações. Não-exaustivo: pentest
externo (TASK-15-03) deve adicionar findings novos. Severidade segue
CVSS-like (qualitativo).

## Diagrama de confiança (alto nível)

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  User input     │ ──>│  Renderer (Vite) │ ──>│  Main (Electron) │
│  (composer,     │    │  contextIsolation│    │  ipcMain (tRPC)  │
│  attachments)   │    │  preload bridges │    │  services        │
└─────────────────┘    └──────────────────┘    └──────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼─────────┐
        ▼                       ▼                       ▼         ▼
   ┌─────────┐         ┌─────────────┐         ┌──────────┐  ┌─────────┐
   │  Vault  │         │ MCP stdio   │         │ Sources  │  │  LLM    │
   │ safeStrg│         │ subprocess  │         │ HTTP/OAuth│  │ provider│
   └─────────┘         └─────────────┘         └──────────┘  └─────────┘
   trusted              partial trust          trusted-by-cfg  external
```

## Threats catalogados

### T-01 — Prompt injection via source data

**Vector:** Dados de source MCP/managed (ex.: email, doc compartilhado)
contêm payload injetando instruções no agente.

**Severidade:** Alta. Realista — qualquer LLM agent é vulnerável.

**Mitigação atual:**
- Permission broker (ADR-0134) — tools sensíveis pedem confirmação por
  `(toolName, argsHash)` antes de executar.
- Sources marcadas `enabled` por sessão (não global) — user opt-in
  explícito por contexto.
- Tool catalog read-only — agent não pode adicionar tools novas em
  runtime.

**Gap:** sem detecção heurística de prompt injection no input. Adicionar
após primeiro incident — heurísticas falsas são ruim UX.

### T-02 — Credential exfiltration via malicious MCP server

**Vector:** User instala MCP server stdio malicioso (custom). Server tenta
ler `credentials.enc` do diretório userData.

**Severidade:** Alta.

**Mitigação atual:**
- MCP stdio subprocess roda no userland normal — não tem acesso
  privilegiado ao keyring (safeStorage decryption só funciona via API
  Electron, processo do user precisa estar autorizado pelo OS).
- Vault file (`credentials.enc`) é AES-GCM. Mesmo se subprocess ler,
  não decripta sem masterKey derivada da safeStorage.
- `runtime mode policy` em ADR-0086 isola subprocess via `setsid`/
  `CREATE_NEW_PROCESS_GROUP` quando aplicável.

**Gap:** subprocess pode ler diretório arbitrário no $HOME do user (não
só `credentials.enc`). Sandbox por subprocess (firejail / AppContainer)
está deferred — alto custo, baixo retorno se vault está criptografado.

### T-03 — RCE via renderer XSS

**Vector:** Conteúdo de source/agent inclui HTML malicioso. Renderer
sem CSP estrita executa script.

**Severidade:** Crítica se realizada.

**Mitigação atual:**
- `react-markdown` + `rehype-sanitize` — renderiza markdown, strip de
  HTML perigoso.
- CSP estrita no Vite build (verificar em audit).
- `contextIsolation: true` — preload bridge acessa só APIs whitelistadas.

**Gap:** Audit precisa validar CSP coverage real (`unsafe-eval`,
`unsafe-inline`).

### T-04 — Supply chain compromise via dep maliciosa

**Vector:** dep transitiva publicada com payload malicioso (typosquat,
maintainer takeover).

**Severidade:** Crítica.

**Mitigação atual:**
- `pnpm-lock.yaml` committed — versões pinned.
- `engines` enforce Node 24 + pnpm 10.33 — reduz surface de "ferramenta
  diferente, comportamento diferente".
- Postinstall scripts auditáveis via `pnpm config get ignore-scripts`.

**Gap:** Não há scan automatizado (Snyk, GitHub Advisory) no CI hoje.
Adicionar como gate (deferred — TASK pendente).

### T-05 — Update MITM ou downgrade attack

**Vector:** Auto-update endpoint comprometido ou MITM serve binário
antigo (com bug conhecido).

**Severidade:** Alta.

**Mitigação atual:**
- electron-builder + `autoUpdater` valida assinatura do installer no OS.
  Sem assinatura válida → install rejeitada.
- Update feed via HTTPS (GitHub releases).
- Versão monotônica — `autoUpdater` rejeita downgrade default.

**Gap:** rollback intencional (force install version older) requer
disable do downgrade check — operação manual, baixo risco em prod.

### T-06 — PII leak via telemetria

**Vector:** User insere informação sensível no chat. Telemetria captura
breadcrumb com texto cru → vazamento pra Sentry/PostHog.

**Severidade:** Média (impacto é privacy, não compromise).

**Mitigação atual:**
- `scrubSentryEvent` central em `@g4os/observability/sentry/scrub.ts` —
  ADR-0062. Filtra `email`, `password`, `token`, `apiKey`, etc.
- PostHog opt-in (TASK-18-11) — sem consent não envia nada.
- Logs `pino` JSON — campos `email`/`token` redacted via `redact: [...]`
  na config.

**Gap:** scrub é heurístico — pode falhar com payload novo. Test
coverage do scrub deve crescer com cada incident.

### T-07 — Tampering de runtime hashes

**Vector:** Antivirus quarantine ou disk corruption modifica binário
(`node`, `python`, `git`, `uv`) bundled. App funcionou antes; após
update do AV, runtime corrupto.

**Severidade:** Média (DoS, não compromise).

**Mitigação atual:**
- `verifyRuntimeIntegrity` (TASK-15-01) compara SHA-256 dos runtimes
  bundled contra installer manifest. Disponível on-demand em Repair Mode.
- Boot path checa só presença, não hash — verificação cara fica em
  Repair.

**Gap:** sem self-healing — user precisa reinstalar manualmente. Future:
auto-redownload do runtime corrupto via update channel.

### T-08 — Path traversal em tool handlers

**Vector:** Tool `read_file` ou `list_dir` recebe path `../../../etc/passwd`
de input do agente.

**Severidade:** Crítica.

**Mitigação atual:**
- `path-guard.ts` (`packages/agents/src/tools/shared/path-guard.ts`) —
  resolve absolute + valida com `path.relative` que não tem `..`.
  Cross-platform (POSIX + Windows).
- Tool handlers só operam dentro de `workingDir` da sessão (escolhido
  pelo user).

**Status:** mitigada. Auditor deve validar coverage (todos os handlers
usam `resolveInside()`).

## Cobertura de threats no audit

Auditor deve, no mínimo:
1. Replicar T-03 com payload XSS pra confirmar CSP.
2. Replicar T-08 com path traversal em cada tool handler.
3. Validar que MCP stdio subprocess não escapa do diretório workspace
   sem user interaction.
4. Confirmar que `safeStorage` rejeita decrypt cross-process (vault não
   é decriptável fora do app).
5. Validar update flow com installer modificado (signature invalid).

## Atualização

Threats novas descobertas em incident response ou audit retornam pra
este doc com **status**, **vector**, **mitigação**, **gap**. Mudança em
threat existente requer commit dedicado com referência ao incident.
