# ADR 0143: MCP stdio probe distinto do `McpClient` real

## Metadata

- **Numero:** 0143
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** FOLLOWUP-OUTLIER-12 (slice 1)

## Contexto

`SourcesService.testConnection` precisa dizer a um source `mcp-stdio` se ele "está vivo" antes de montá-lo no broker da sessão — hoje a UI tem um botão "Testar conexão" (OUTLIER-12 slice 2) que não podia simplesmente retornar o status persistido.

Problema: duas formas de falar MCP via stdio convivendo no repo:

1. O `McpClient` real (contrato `@g4os/sources/mcp-stdio.McpClient`) que ativa o source no lifecycle da sessão, mantém conexão viva, negocia capabilities, roteia tool calls.
2. Um preflight leve que apenas valida "o binário starta e responde a `initialize`".

Opções consideradas:

### Opção A: Implementar o `McpClient` real via `@modelcontextprotocol/sdk` agora e usá-lo no probe

**Contras:** adiciona dependência ao `@g4os/sources` ou ao `@g4os/desktop`, exige um ADR próprio sobre versão/pin do SDK, e o `McpClient` real precisa ser desenhado pro broker (pool, reconnect, lifecycle com `ISource`) — trabalho XL. Usar o cliente "real" só para um probe de 5s desperdiça esse investimento e acopla testConnection ao desenho do broker.

### Opção B: Probe ad-hoc `initialize` JSON-RPC (aceita)

**Descrição:**

- Novo helper `packages/sources/src/mcp-stdio/probe.ts` — spawn → write `{"jsonrpc":"2.0","id":1,"method":"initialize",...}` → aguarda `result` / `error` com timeout 5s → mata o processo.
- DI-friendly: `SpawnFn` injetável (`ProbeDeps.spawn`), default é `node:child_process.spawn` via dynamic import.
- Retorna `'connected' | 'needs_auth' | 'error'`. `needs_auth` quando a mensagem do erro menciona `auth`/`unauthor`.
- Zero dep nova. Zero acoplamento ao `McpClient`. Zero risco de substituir a implementação futura do client real.

### Opção C: Retornar o status persistido e documentar "probe real vem depois"

**Contras:** era o estado anterior. UX ruim — o botão "Testar conexão" não poderia existir de forma honesta, e não distinguimos "binário quebrado" de "binário OK sem auth".

## Decisão

**Opção B.** O probe é um preflight leve, intencionalmente separado do `McpClient` real:

- `probe.ts` responde `SourcesService.testConnection` / UX de "Testar conexão".
- `McpClient` real (a ser implementado em FOLLOWUP-OUTLIER-12 Phase 2) responde ao broker de sessão, tool calls e reconexão.

Duas surfaces, dois propósitos. Quando o `McpClient` SDK-backed chegar, o probe pode ser revisto — possivelmente consolidado como `client.probe()` estático — mas isso é refactor de implementação, não mudança de contrato externo.

## Consequências

### Positivas

- `testConnection` para `mcp-stdio` deixa de mentir (antes retornava status persistido estático).
- Zero dep adicionada ao monorepo.
- DI permite teste unitário com subprocess fake (6 testes em `mcp-stdio-probe.test.ts` cobrem success, auth, spawn error, exit, timeout, line buffering).
- `source-probe.ts` no main desktop fica magro: só roteia por kind e delega.

### Negativas / Trade-offs

- Duplica uma fatia mínima do handshake MCP (só `initialize`, sem negociação de capabilities nem `tools/list`). Aceito — o probe não pretende substituir o client real.
- Quando `McpClient` SDK-backed existir, o probe pode ficar como código legado até a consolidação. Mitigação: ADR rastreável + referência do FOLLOWUP.

### Neutras

- Probe para `managed` continua retornando status persistido — depende de OAuth live mount (FOLLOWUP-OUTLIER-12 Phase 2).

## Validação

- `pnpm --filter @g4os/sources test` — 51 testes verdes (6 novos em `mcp-stdio-probe.test.ts`).
- `pnpm --filter @g4os/sources typecheck` / `lint` — verdes.
- `pnpm --filter @g4os/desktop typecheck` / `lint` — verdes.
- `check:main-size` 6455/6500 — helper vive em `packages/sources`, fora do budget de main.
- `check:circular` — 0 ciclos.

## Referencias

- `packages/sources/src/mcp-stdio/probe.ts` — implementação.
- `packages/sources/src/__tests__/mcp-stdio-probe.test.ts` — testes.
- `apps/desktop/src/main/services/sources/source-probe.ts` — wire no `SourcesService.testConnection`.
- ADRs 0081–0086 — base de `@g4os/sources` (onde o `McpClient` real eventualmente mora).

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
