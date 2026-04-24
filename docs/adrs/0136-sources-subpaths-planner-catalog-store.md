# ADR 0136: @g4os/sources subpaths — planner/catalog/store (OUTLIER-04 unpark + refactor)

## Metadata

- **Numero:** 0136
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-04 (sources UI desparkada) + refactor

## Contexto

OUTLIER-04 unpark entregou `/connections` route + SourcesPage + CatalogItemCard + CreateStdioDialog. Backend: `SourcesStore` (JSON per-workspace), `managed-catalog.ts` (15 seeds) e `source-planner.ts` (classifica native_deferred/broker_fallback/filesystem_direct). Tudo ficou em `apps/desktop/src/main/services/sources/*` — ~650 LOC.

O `@g4os/sources` package já existia com subpaths `interface`, `mcp-stdio`, `mcp-http`, `managed`, `oauth`, `lifecycle` (ADRs 0081-0086). Os 3 módulos de OUTLIER-04 (planner, catalog, store) são puros TS com deps apenas em `@g4os/kernel`. Ficar em main é tanto main-size pressure quanto coupling incorreto — `planTurn()` é um "algoritmo de classificação" independente de composition root.

## Opções consideradas

### Opção A: Manter em main
**Contras:** 650 LOC em main violam cap 6200. Também dificulta reuso pelo worker-side (hipotético) ou pela camada de teste.

### Opção B: Hospedar tudo em `@g4os/sources` (no subpath root `.`)
**Contras:** root já mixa interface + lifecycle. Adicionar planner/catalog/store no root barrel inflaria o bundle pra consumers que só querem `interface` type.

### Opção C: Três subpaths novos — `./planner`, `./catalog`, `./store` (aceita)
**Descrição:**
- `@g4os/sources/planner` — `planTurn()`, `formatPlanForPrompt()`, `classifyBucket()`, `SourcePlanInput`/`SourcePlan`/`SourcePlanItem`. Pure; depende só de `@g4os/kernel/types`.
- `@g4os/sources/catalog` — `MANAGED_CATALOG_SEEDS` (15 connectors), `buildCatalog()`, `catalogEntry()`. Pure data.
- `@g4os/sources/store` — `SourcesStore` class, JSON atômico write→rename, `resolveWorkspaceRoot` callback injection. Node `fs/promises` + `crypto` only.
- `packages/sources/package.json` + `tsup.config.ts` adicionam os 3 entry points.

## Decisão

**Opção C.** Tree subpaths novos em `@g4os/sources`. Main `sources-service.ts` importa de `@g4os/sources/store` + `@g4os/sources/catalog`. `TurnDispatcher` importa de `@g4os/sources/planner`. Tool handler `activate_sources` (ADR-0137) importa abstrações estruturais, não esses subpaths diretamente.

## Consequências

### Positivas
- Main cai 438 LOC (source-planner 119 + managed-catalog 152 + sources-store 167).
- Subpath fine-grained: consumer que quer só o planner não puxa filesystem (`store`) nem dados (`catalog`).
- Cruiser `agents-interface-isolated` continua OK — o tool handler `activate-sources` em `@g4os/agents/tools` NÃO importa `@g4os/sources/*`; usa interfaces estruturais injetadas por main (ADR-0137).

### Negativas / Trade-offs
- 3 novos entry points em `tsup.config.ts`. CI build time aumenta marginalmente.
- Consumers agora têm 3 imports ao invés de 1 "kitchen sink". Preço da granularidade.

### Neutras
- Catalog seeds (Gmail, Google Calendar/Drive/Docs/Sheets, Outlook email/cal, Teams, Slack, GitHub, Linear, Jira, Asana, Pipedrive, Trello) continuam apenas metadata — OAuth flow e connector execute real vêm em FOLLOWUP-OUTLIER-12.

## Validação

- `check:main-size` 5976/6200 ✓
- `apps/desktop/package.json` declara `@g4os/sources` como workspace dep.
- SourcesService real executa list/enable/disable/createStdio/createHttp/delete/testConnection via IPC.
- `/connections` route real renderiza catálogo + sources instaladas.

## Referencias

- ADRs 0081-0086 (sources package original)
- ADR-0137 (activate_sources tool handler abstraction)
- TASK-OUTLIER-04 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
