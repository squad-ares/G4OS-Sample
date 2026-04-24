# ADR 0065: Debug info export (ZIP sanitizado com redação dupla)

## Metadata

- **Numero:** 0065
- **Status:** Accepted
- **Data:** 2026-04-19
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @security, @suporte
- **Task relacionada:** TASK-06-06 (epic 06-observability)

## Contexto

Suporte a usuários v1 trabalhava com prints e logs colados manualmente no chat. Dois problemas recorrentes:

1. Dados faltando — usuário manda o erro, não o contexto (versão, flavor, logs dos últimos minutos, métricas, config com credencial redigida).
2. Secret vazando — usuário cola log cru que contém `Bearer sk-ant-...` ou JWT no suporte; incidente de segurança foi aberto em v1 por isso.

Solução v2: um comando em `Settings > Help > Export debug info` que gera um ZIP completo, sanitizado, com redação *dupla* (no shape antes de serializar + no texto dos logs depois de lidos).

## Opções consideradas

### Opção A: Upload direto para serviço interno de suporte
**Pros:** Zero atrito no usuário.
**Contras:** Compliance LGPD/GDPR pede consentimento explícito; usuário não vê o que foi enviado.

### Opção B: `archiver` + collector explícito (aceita)
**Descrição:**
- [`packages/observability/src/debug/export.ts`](../../packages/observability/src/debug/export.ts) — `exportDebugInfo(options)`:
  - `outputPath`, `systemInfo` (app + platform + runtime), `config`, `logsDir?`, `logsMaxAgeDays?` (default 7), `crashesDir?`, `processSnapshot?`, `metrics?`.
  - Escreve `system.json` + `config.json` (sanitizado por `scrubObject`) + `logs/*.log` (rescan via `scrubString`) + `metrics.prom` (snapshot do registry) + `crashes/` (diretório, se existir) + `processes.json`.
  - Cada logs só entra se `.log`/`.log.jsonl`, dentro da janela de retenção, e sob `10 MiB` por arquivo.
  - Streams via `archiver` com compressão `zlib` nível 9.
- [`packages/observability/src/debug/redact.ts`](../../packages/observability/src/debug/redact.ts) — reexporta `scrubObject` (shape) e `scrubString` (texto) já usados no scrub do Sentry (ADR-0062), garantindo **uma regra** de redação em toda a v2.

### Opção C: Redação só no momento de logar
**Contras:** Usuário pode ter logs antigos salvos em disco que precedem a nova regra. Dupla defesa é essencial.

## Decisão

**Opção B.** Redação em duas camadas e colocadas no pacote de observabilidade para compartilhar com Sentry — evolução futura (nova chave sensível) atualiza `SCRUB_KEYS`/`SECRET_VALUE_PATTERNS` em um lugar só.

A complexidade de `exportDebugInfo` é mantida abaixo do limite Biome (15) quebrando em helpers: `appendLogs`, `appendMetrics`, `appendCrashes`, `appendProcessSnapshot`.

## Consequências

### Positivas
- Redação é a mesma do Sentry (ADR-0062) — uma fonte de verdade.
- ZIP é material auditável antes de enviar; usuário abre, confere, compartilha.
- Tamanho controlado: logs > 10 MiB saltados, apenas os últimos 7 dias; normal fica bem abaixo de 50 MB.

### Negativas / Trade-offs
- Rescan dos logs por `scrubString` duplica trabalho já feito no logger (ADR-0060). Aceitável como defesa em profundidade contra log escrito antes da regra atual.
- `archiver` é maior do que `zlib` manual. Trade pela correção (headers ZIP corretos, streaming, diretórios recursivos de crashes).

### Neutras
- IPC/UI que chama `exportDebugInfo` não faz parte deste ADR — será adicionada quando o painel `Settings > Help` for renderizado.

## Validação

- 2 testes (`debug-export.test.ts`):
  - ZIP gerado com entries esperados (`system.json`, `config.json`, `metrics.prom`, `logs/app.log`).
  - Secrets em config (`sk-ant-*`, JWT) e em log cru (`Bearer sk-ant-*`) **não** aparecem no ZIP final quando lido byte-a-byte.

## Referencias

- ADR-0060 (pino), ADR-0062 (Sentry scrub), ADR-0064 (metrics export).
- [archiver](https://github.com/archiverjs/node-archiver)
- `STUDY/Audit/Tasks/06-observability/TASK-06-06-debug-info-export.md`

---

## Histórico de alterações

- 2026-04-19: Proposta + aceita (TASK-06-06 landed)
