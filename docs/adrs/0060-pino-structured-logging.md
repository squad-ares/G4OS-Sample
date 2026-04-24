# ADR 0060: pino como logger estruturado único (com transports produção)

## Metadata

- **Numero:** 0060
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @devex
- **Task relacionada:** TASK-06-01 (epic 06-observability)

## Contexto

V1 usava três estratégias de log em paralelo (`console.*`, `electron-log`, prints ad-hoc em arquivos), total de 330+ ocorrências de `console.*`. Resultado:

- Logs de produção sem nível/escopo consistente; grep virou o único filtro.
- Rotation e retenção inconsistentes entre estratégias — arquivos crescendo sem limite no Windows.
- Segredos em texto plano em suporte logs (ver TASK-06-06 — caso "user colou JWT no chat").

v2 precisa de:
1. **Um** logger. Biome bloqueia `console.*` fora de `scripts/**`.
2. Output estruturado (JSON) pronto para ingestão (Sentry/OTel/Splunk futuros).
3. Redaction *por default* de chaves comuns de credencial em `log.info({ apiKey: '...' })`.
4. Rotação por arquivo em produção sem dependência extra.

## Opções consideradas

### Opção A: `winston`
**Pros:** maduro, muitos transports.
**Contras:** performance ~10x inferior a pino em benchmarks; API legacy baseada em `splat`.

### Opção B: `bunyan`
**Pros:** JSON nativo.
**Contras:** manutenção quase parada; sem transports modernos (OTel).

### Opção C: `pino` + `pino-roll` + `pino-pretty` (aceita)
**Descrição:**
- `pino` para emissão (JSON, redação nativa via `redact.paths`).
- `pino-roll` como transport de produção (rotação por tamanho + data).
- `pino-pretty` apenas em dev.
- Wrapper `createLogger(scope)` em `@g4os/kernel` expõe uma API idiomática (`info`/`warn`/`error` + `child`), impedindo drift.

## Decisão

**Opção C.** Implementação:

- [`packages/kernel/src/logger/logger.ts`](../../packages/kernel/src/logger/logger.ts) — wrapper + `createLogger(scope)` + `REDACT_PATHS` (chaves: `apiKey`, `token`, `password`, `secret`, `authorization`, `cookie`, em raiz, 1 e 2 níveis de profundidade) + `REDACT_CENSOR = '[REDACTED]'`.
- [`packages/kernel/src/logger/transport.ts`](../../packages/kernel/src/logger/transport.ts) — `createProductionTransport` emite dois targets `pino-roll`: `app.log` (info+) e `error.log` (error+); defaults: rotação diária, `100M` por arquivo, histórico de 7. `createProductionLogger(options)` retorna `Logger` já wrappado.
- Nível default vem de `LOG_LEVEL` (allowlistado no `biome.json` para `logger/logger.ts`) com fallback `info`/`debug` por `NODE_ENV`.
- Dev: `pino-pretty` opcional via flag; CI/prod: nunca.

Gate: `noConsole: error` continua forçando o caminho único.

## Consequências

### Positivas
- API única, tipada, redigida por default — impossível vazar `apiKey` em `log.info(obj)` sem explicitar.
- Performance: pino tem overhead negligível no hot path (<5µs/log em Node 24).
- Transport isolado via worker thread (`pino.transport({ targets })`) — não bloqueia main.
- Logs em produção prontos para ingestão (JSON linhas).

### Negativas / Trade-offs
- Worker thread do transport pode atrasar flush em crash. Mitigado com `pino.final()` no handler de shutdown e captura paralela pelo Sentry (ADR-0062).
- `REDACT_PATHS` é estático: novos shapes exigem atualização manual. Aceitável — auditável; lista expande com `SENSITIVE_KEYS`.

### Neutras
- `pino-roll` é o único artefato extra no runtime. Ficheiros rotacionam no próprio FS; sem serviço externo.

## Validação

- 5 testes unitários (`packages/kernel/src/logger/__tests__/logger.test.ts`): redação em raiz/nested/array, cobertura de `authorization`/`cookie`, defaults e overrides do transport config.
- Lint gate (`noConsole: error`) bloqueia regressão.

## Referencias

- [pino — docs](https://github.com/pinojs/pino)
- [pino-roll](https://github.com/mcollina/pino-roll)
- `STUDY/Audit/Tasks/06-observability/TASK-06-01-pino-integration.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-01 landed)
