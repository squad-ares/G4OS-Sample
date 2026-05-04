# Runbook: MCP subprocess zumbi

**Quando usar:** alert `McpSubprocessZombie` disparou ou contagem de subprocesses
MCP no host é maior que `g4os_mcp_subprocess_active` (subprocess existe no OS
mas não está mais sob supervisão do main process).

**Tempo alvo:** identificar PID + matar em ≤3 minutos.

---

## 1. Sintomas

- Alert `McpSubprocessZombie` no Prometheus
  (`g4os_mcp_subprocess_count - g4os_mcp_subprocess_active > 0` por > 5 min).
- Cliente reporta "uma source MCP travou" mas não consegue desabilitar — tool
  call retorna timeout.
- `ps aux | grep mcp-server` no host do cliente mostra mais processos do que
  `Settings → Sources` lista como ativos.

## 2. Diagnóstico

### 2.1. Dashboard `G4OS MCP Subprocesses` (uid `g4os-mcp`)

Painéis chave:
- **Subprocess count over time** — compara `total` vs `active`. Divergência >0
  por >5 min = zumbi confirmado.
- **RSS por subprocess (top 10)** — identifica qual slug está pesado/leaking.
- **Tool call duration p95 — por tool** — se algum tool tem p95 >30s, o
  subprocess provavelmente está hangando.
- **Tool error rate por slug** — se >50%, o subprocess está respondendo lixo
  (provável pipe quebrado).

### 2.2. Logs do supervisor

```
{service="g4os-desktop", logger="mcp-supervisor"} | json
```

Procura por:
- `mcp-stdio: spawn failed` — subprocess nasceu morto (binário ausente?
  permissão? `runtime mode policy` rejeitando?).
- `mcp-stdio: dispose timeout` — subprocess não respondeu a `SIGTERM` em 5s
  (probe `probeMcpStdio` cobre isso, mas só em activate; rotinas de shutdown
  podem ter lacuna).
- `mcp-stdio: stderr` — output do server. Stack traces aqui são gold.

### 2.3. Logs do tool-loop

```
{service="g4os-desktop", logger="tool-loop"} |~ "mcp_<slug>__" | json
```

Procura: tools com nome `mcp_<slug>__<toolname>` retornando timeout.
Se tool nunca completa, o subprocess provavelmente está bloqueado em
`stdin.read()` ou em chamada externa (rede).

## 3. Mitigação

### Imediato

1. **Identificar PID:**
   ```bash
   ps aux | grep -i 'mcp-server\|<slug>'
   ```

2. **Matar subprocess:**
   ```bash
   kill -9 <pid>
   ```
   - V2 usa `tree-kill` no shutdown — kill sob `<pid>` deve cascatear nos
     filhos. Se não cascatear, alguma dep externa criou processo solto.

3. **Reiniciar app do cliente.** O `McpMountRegistry` recria o cliente no
   próximo turn que tentar usar a source.

### Curto prazo

- Verificar se o slug culpado tem `runtime mode = compat`. `protected` mode
  isola subprocess via `setsid`/`CREATE_NEW_PROCESS_GROUP`; `compat` (Windows
  + browser-auth) é mais sujeito a leak.
- Se o subprocess é de um pacote managed (catálogo de 15 seeds), abrir issue
  no upstream do MCP server. Anexar:
  - Output de `stderr` capturado (passo 2.2).
  - Versão do binário (`<slug> --version` se suportado).
  - Stack trace de `dispose timeout`.

### Longo prazo

- Adicionar timeout de tool call no `TurnDispatcher` (já existe via
  `AbortSignal`, mas confirmar que está sendo propagado pra `mcp-pool`).
- Avaliar substituir o MCP server por equivalente managed (catálogo) se zumbi
  é recorrente.
- Considerar registrar no `McpMountRegistry` um health-check periódico
  (cada 30s) que detecta hang antes do alert disparar.

## 4. Quando escalar

- Múltiplos slugs zumbis simultâneos no mesmo cliente — pode ser problema de
  recurso (file descriptors esgotados, memória insuficiente).
- Zumbi reaparece após kill + restart do app — bug no path de spawn (talvez
  binary cached em estado ruim).
- Same slug zumbi em vários clientes — bug upstream no MCP server.

## 5. Referências

- Dashboard: `G4OS MCP Subprocesses` (uid `g4os-mcp`)
- ADR-0086 — MCP stdio runtime mode policy
- ADR-0143 — `probeMcpStdio` distinto de `McpClient`
- ADR-0144 — SDK-backed `McpClient` via dynamic import
- `packages/sources/src/mcp-stdio/source.ts`
- `apps/desktop/src/main/services/mcp-mount-registry.ts`
