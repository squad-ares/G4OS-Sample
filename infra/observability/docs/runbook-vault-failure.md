# Runbook: Vault failure spike

**Quando usar:** alert `VaultGetFailureSpike` ou `VaultSetFailureSpike` disparou,
ou cliente reporta "perdi minhas credenciais" / "tenho que logar de novo toda
hora".

**Tempo alvo:** distinguir bug vs ambiente em ≤5 minutos. Recovery via backup
em ≤10 minutos se o arquivo tiver sido corrompido.

---

## 1. Sintomas

- Alert Prometheus `VaultGetFailureSpike` (>5% error rate sustentado 5 min).
- Sentry crash com stack trace passando por `CredentialVault.get/set/delete`.
- Cliente reporta:
  - "Tenho que logar de novo cada vez que abro o app." → token de auth não
    persiste (vault.set falhando silenciosamente, vault.get retornando null).
  - "Configurações de source MCP/managed sumiram." → corrupção de
    `credentials.enc`.
  - "Erro ao salvar API key." → escrita falha (mutex starvation? safeStorage
    indisponível?).

## 2. Diagnóstico

### 2.1. Dashboard `G4OS Credentials Vault` (uid `g4os-vault`)

Painéis chave:
- **Error rate** (KPI) — verde <1%, amarelo 1-5%, vermelho >5%.
- **Vault error rate por kind** — quebra por categoria:
  - `safe_storage_unavailable` → ambiente Linux headless ou container sem keyring.
  - `decrypt_failed` → masterKey inválida ou arquivo corrompido.
  - `file_io` → permissão / disco cheio / file descriptor esgotado.
  - `mutex_timeout` → contenção (ver Mutex wait time p95).
- **Mutex wait time p95** — se >100 ms sustentado, é mutex starvation. Patch
  histórico: `CR12-B5` (verificar `git log --grep="CR12-B5"` se aplicado).
- **Refresh queue depth** — se cresce monotonicamente, refresh handlers estão
  travando ou agendamento está em loop.

### 2.2. Causas conhecidas

#### Linux headless / container

`Electron.safeStorage.isEncryptionAvailable()` retorna `false` em:
- Container Docker sem `libsecret-1` instalado.
- Sessão SSH sem `gnome-keyring` / `kwallet` rodando.
- WSL sem `dbus`.

V2 fallback: vault em modo `file` com chave derivada via PBKDF2 (ADR-0050).
Detecção: log `pino` `[credentials] safeStorage unavailable, using file backend`
no boot. Se cliente está em Linux + reporta credentials não persistindo,
provavelmente o backend caiu pra `file` e o `masterKey` não está sendo
derivado consistentemente entre boots.

#### File handle exausto

Sintoma: error kind `file_io` + `EMFILE` no log.
Diagnóstico: `lsof -p <pid> | wc -l` no host do cliente.
Mitigação: aumentar `ulimit -n`. App não deveria abrir mais de ~50 fds em
operação normal — se está em centenas, há leak de file handle (geralmente
streams JSONL de event store sem `.end()` propagado).

#### Mutex starvation

Sintoma: `mutex_timeout` errors + `Mutex wait time p95 > 1s`.
Causa: alguém está chamando `vault.set` em hot loop (refresh handler buggy)
e starveing reads. V2 mutex é fila FIFO — se não está sendo respeitado,
provavelmente `RotationOrchestrator` está disparando rotation múltiplas vezes
em paralelo.

#### Backup file corruption

Sintoma: cliente abre app → erro `decrypt_failed` no boot → `restore from backup`
no log → também falha.
V2 mantém 3 backups rotativos (`credentials.enc.bak.{1,2,3}`) — ADR-0051.
Recovery: copiar `credentials.enc.bak.3` (o mais antigo) sobre
`credentials.enc` e tentar de novo. Se TODOS os backups falham, é bug grave
de escrita atômica.

### 2.3. Logs

```
{service="g4os-desktop", logger=~"vault|credentials"} | json
```

Procura por (em ordem de severidade):
1. `decrypt_failed` em boot — corrupção; partir pro recovery via backup.
2. `safeStorage unavailable` — fallback pra file backend; verificar consistência
   do masterKey derivation.
3. `mutex timeout 5s` — starvation; identificar caller.
4. `backup write failed` — escrita atômica falhou; risco de corrupção em
   próximo crash.

## 3. Mitigação

### Imediato

- **Para o cliente individual:**
  - Se erro de boot: orientar a procurar `credentials.enc.bak.{1,2,3}` na pasta
    de userData (`~/Library/Application Support/g4os-desktop/` em macOS,
    `%APPDATA%\g4os-desktop\` em Windows, `~/.config/g4os-desktop/` em Linux).
    Renomear o `.bak.3` (mais antigo) sobre `credentials.enc` e tentar abrir.
  - Se erro recorrente em runtime: pedir restart do app.

- **Para spike no fleet:**
  - Identificar versão afetada (Sentry release tag).
  - Se >10% dos clientes da versão estão falhando, fazer rollback via auto-update
    pinning na versão anterior.

### Curto prazo

- Reproduzir em dev: stress test do vault com 100 set/get concurrent.
- Verificar último merge que tocou em `packages/credentials/`:
  ```
  git log --since="7 days ago" -- packages/credentials/
  ```
- Se for safeStorage unavailable em Linux: documentar pré-requisitos no installer
  (libsecret + dbus). Hoje só tem warning no log.

### Longo prazo

- Adicionar smoke test em CI noturno que roda vault em container Linux mínimo.
- Considerar instrumentar `vault.set/get/delete` com OTel spans pra correlacionar
  com a session/turn que disparou (hoje só tem métrica counter).

## 4. Quando escalar

- Decrypt fail rate >1% no fleet — pode indicar masterKey derivation regressing.
- Backup recovery falhando para múltiplos clientes — escrita atômica quebrada.
- Spike de `mutex_timeout` correlacionado a deploy específico — abrir incident
  e considerar rollback imediato.

Escalar para: dev senior + security lead (qualquer corruption de credenciais
tem impacto de segurança — tokens podem ter vazado pra log se a path de erro
não scrubeu).

## 5. Referências

- Dashboard: `G4OS Credentials Vault` (uid `g4os-vault`)
- ADR-0050 — CredentialVault gateway + Electron safeStorage
- ADR-0051 — Backup rotation 3x + escrita atômica
- ADR-0052 — Migrador V1→V2 idempotente
- ADR-0053 — RotationOrchestrator
- `packages/credentials/src/vault.ts`
- `packages/credentials/src/backends/safe-storage.ts`
