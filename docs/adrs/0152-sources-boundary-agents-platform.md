# ADR 0152: `@g4os/sources` boundary — depende de kernel + platform + agents/tools

## Metadata

- **Numero:** 0152
- **Status:** Accepted
- **Data:** 2026-04-26
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

ADR-0081 e ADR-0086 estabeleceram que `@g4os/sources` deveria depender
**apenas de `@g4os/kernel`**. Em iterações posteriores, dois subpaths
quebraram esse contrato sem ADR formalizando a exceção:

1. **`@g4os/sources/broker`** (TASK-OUTLIER-12 / FOLLOWUP MVP-CLOSE) usa
   `ToolHandler` de `@g4os/agents/tools` para construir handlers compostos
   que mountam ferramentas MCP. Sem essa dep, `buildMountedToolHandlers`
   precisaria duplicar o tipo ou viver fora do package — o que perde a
   coesão da broker layer.

2. **`@g4os/sources/mcp-stdio`** (CR3-01) precisa de `getPlatformInfo()`
   para resolver o default de `NodeJS.Platform` no factory do source. Sem
   isso, o caller (apps/desktop main) teria que importar `@g4os/platform`
   e injetar manualmente em todo lugar — perda ergonômica e pior, o
   default `process.platform` direto violaria ADR-0013.

`code-review-2 TASK-CR2-06` flagou o drift e exigiu ADR. Esta ADR formaliza
a decisão e congela a regra via dependency-cruiser (`sources-layering`).

## Opções consideradas

### Opção A — Manter `@g4os/sources` strict (apenas `kernel`)

**Descrição:** Reverter as duas dependências:
- Mover `ToolHandler` de `@g4os/agents/tools` para `@g4os/kernel` (ou um
  pacote horizontal novo `@g4os/tool-types`).
- `mcp-stdio/factory.ts` exigiria `platform: NodeJS.Platform` obrigatório
  injetado pelo caller — sem default.

**Pros:**
- Boundary limpa, alinhada ao ADR-0081 original.
- Zero acoplamento extra.

**Contras:**
- `ToolHandler` é semanticamente um conceito de **agente** (descreve como
  uma tool é executada por uma execução turn). Movê-lo para kernel ou
  novo pacote horizontal espalha responsabilidade.
- `mcp-stdio/factory` exigir injeção em todos call-sites multiplica
  boilerplate; tests teriam que importar `@g4os/platform`.
- Cria atrito sem ganho real — agents é nível arquitetural acima de
  sources mas com forte afinidade (tools rodam dentro do tool-loop do
  agent).

### Opção B — Aceitar deps com regra cruiser explícita (escolhida)

**Descrição:** Permitir `@g4os/sources` depender de `kernel`, `platform`,
e `agents` (qualquer subpath) — mas só esses três. Regra
`sources-layering` no `.dependency-cruiser.cjs` falha qualquer outro
import.

**Pros:**
- `broker` continua co-localizado com a lógica de mount; `mcp-stdio`
  continua self-contained com default sensato.
- Boundary segue **enforçada** — não vira "sugestão" — só amplia o set
  permitido.
- Reflete a realidade do produto: sources operam sobre tools que são
  conceito de agent, e MCP stdio é cross-platform.

**Contras:**
- Drift potencial se outros subpaths começarem a importar `agents` sem
  necessidade. Mitigado pelo gate (qualquer outro import quebra CI).

### Opção C — Mover `ToolHandler` para `@g4os/agents/interface`

**Descrição:** ToolHandler vive em `agents/interface` (que é só tipos +
contratos), e sources continua dependendo só de `kernel` + tipo de tool.

**Pros:**
- Mantém boundary original.

**Contras:**
- `interface` foi escopada (ADR-0070) como "IAgent + AgentRegistry +
  schemas" — não é depósito de tipos de execução. Adicionar `ToolHandler`
  diluiria.
- `mcp-stdio` continua precisando de platform; não resolve essa parte.

## Decisão

**Opção B**. A regra `sources-layering` em `.dependency-cruiser.cjs`
permite:

```
from: ^packages/sources
to:   ^packages/(kernel|platform|agents|sources)
```

O agente `@g4os/sources/broker` pode importar `@g4os/agents/tools`
(`ToolHandler`, `composeCatalogs`). Demais subpaths (`interface`,
`mcp-stdio`, `mcp-http`, `managed`, `oauth`, `lifecycle`, `planner`,
`catalog`, `store`) **não devem** importar de `agents` — só de `kernel`
e `platform`. O cruiser não distingue subpaths internos de sources mas
o code review fica responsável por isso.

A regra `agents-interface-isolated` foi reescopada para apenas
`packages/agents/src/interface` (subpath puramente contractual). Outros
subpaths de agents (`tools`, `claude`, `codex`, `shared`, etc.) podem
depender de `kernel` + `platform` via nova regra `agents-layered`.

## Consequências

### Positivas

- `broker` layer permanece coeso e self-contained.
- `mcp-stdio` factory tem default sensato (resolve via `getPlatformInfo`)
  com possibilidade de injeção para testes.
- `sources-layering` no cruiser bloqueia drift pra outros packages
  (data, observability, features, ipc, etc.).
- `agents-interface-isolated` agora é específico ao subpath que
  realmente é contract-only — protege o miolo do contract sem inflar
  outras camadas.

### Negativas / Trade-offs

- Sources tem 3 dependências internas em vez de 1. Build graph maior.
- Subpaths de sources que **não** deveriam usar `agents` (ex.: `mcp-stdio`)
  passam a poder importar — vigilância via code review.
- `code-review-2 TASK-CR2-06` originalmente queria reverter; esta ADR
  reverte essa diretiva com justificativa formal.

### Neutras

- Tests existentes continuam passando.
- Bundle do desktop não muda significativamente.

## Validação

- `pnpm check:cruiser` deve ficar verde com `sources-layering` ativa.
- `pnpm check:platform-leaks` deve ficar verde — confirma que
  `mcp-stdio/source.ts` não usa `process.platform` direto, só
  `getPlatformInfo()` via factory.
- Adicionar PR em `mcp-stdio/factory.ts` que importe outro pacote (ex.:
  `@g4os/data`) deve quebrar o gate.

## Referências

- ADR-0070 — IAgent + AgentRegistry (interface contract).
- ADR-0073 — Agents shared broker (`McpPoolClient`, `PermissionHandler`).
- ADR-0081 — Source interface + registry (versão original "kernel only").
- ADR-0086 — Source lifecycle manager (sticky/rejected per session).
- ADR-0143 — MCP stdio probe distinto do client.
- ADR-0144 — MCP stdio SDK-backed client.
- code-review-2.md TASK-CR2-06 — flag original do drift.
- code-review-3.md TASK-CR3-04 — boundary ADR + cruiser rule.
- `.dependency-cruiser.cjs` — regras `sources-layering`,
  `agents-interface-isolated`, `agents-layered`.

---

## Histórico de alterações

- 2026-04-26: Proposta e aceita junto com regra cruiser e dep declarada
  em `packages/sources/package.json`.
