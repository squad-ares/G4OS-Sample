# ADR 0151: `_app.tsx` excede gate de 500 LOC com isenção justificada

## Metadata

- **Numero:** 0151
- **Status:** Accepted
- **Data:** 2026-04-26
- **Autor(es):** @igor
- **Stakeholders:** @tech-lead

## Contexto

`apps/desktop/src/renderer/routes/_app.tsx` é o composition root da rota
autenticada. Ele concentra:

1. Wiring de queries TanStack Query (sessions, projects, sources, news, labels,
   workspaces, marketplace).
2. Handlers locais (rename, archive, restore, delete, pin, star, label,
   create session, create project, branching).
3. Render dos 7 painéis de sub-sidebar (sessions / projects / sources /
   marketplace / automations / news / settings).
4. Diálogos modais (CreateSession, CreateProject, RenameSession, BranchTree,
   LabelsManager, SessionContextMenu).

Após extração de helpers para `_app.helpers.tsx` (146 LOC) o arquivo principal
permanece em ~585 LOC, ultrapassando o gate `check:file-lines` de 500.

`scripts/check-file-lines.ts:14` adicionou esse arquivo na lista
`EXEMPTIONS` com comentário inline. Esta ADR formaliza a decisão.

## Opções consideradas

### Opção A: Aceitar a exceção via EXEMPTIONS (sem ADR)

**Pros:**
- Zero esforço.

**Contras:**
- Forcing function vira "sugestão" — qualquer arquivo no futuro pode pedir
  exceção sem rastro arquitetural.
- Próximo dev não sabe se a exceção é temporária ou permanente.

### Opção B: Quebrar `_app.tsx` em N rotas filho do TanStack Router

**Descrição:** Cada painel de sub-sidebar viraria sub-rota com seu próprio
loader/component. `_app.tsx` ficaria só com layout shell.

**Pros:**
- Cada arquivo < 300 LOC.

**Contras:**
- Multiplicação de boilerplate (loaders TanStack para cada painel).
- Re-renders acoplados ao path da URL — sub-sidebar muda quando navega entre
  painéis, mas o layout shell já se cuida disso. URL extra não agrega valor.
- Estado compartilhado (selectedSessionId, openDialog) precisaria ir para
  Jotai ou Context, sem ganho real de coesão.

### Opção C: Quebrar com Context API + render functions extraídas

**Descrição:** Criar `AppShellContext` provider com queries + handlers; cada
painel renderizado por função em arquivo separado consumiria via `useContext`.

**Pros:**
- Reduz arquivo principal.

**Contras:**
- Cada render function precisaria de N props ou consumir context — explosão
  de surface API.
- Composition root deixa de ser óbvio: para entender o fluxo é preciso
  pular entre N arquivos via dependência implícita do context.
- Trade-off de legibilidade ruim para um problema que é puramente de tamanho
  de arquivo, não de complexidade de domínio.

### Opção D: Aceitar exceção formal com teto e plano de retirada

**Descrição:** Manter `_app.tsx` no `EXEMPTIONS` com:

- Teto explícito: 600 LOC (margem de 15 sobre estado atual).
- Justificativa: composition root concentra wiring que separa-lo perde o
  panorama do fluxo da rota autenticada.
- Plano de retirada: se ultrapassar 600 LOC, considerar `useReducer` central
  ou Zustand store local antes de fragmentar em sub-rotas.

## Decisão

**Opção D**. A complexidade do `_app.tsx` é inerente ao composition root
e fragmentá-lo prejudicaria mais a leitura do que tolerar 85 LOC acima do
gate.

`scripts/check-file-lines.ts` mantém a entrada em `EXEMPTIONS` referenciando
esta ADR no comentário.

## Consequências

### Positivas

- Composition root permanece único e legível.
- Helpers puros (`matchPathSegment`, `toSessionListItem`, `renderSessionTagsContent`,
  `toMarketplacePanelItem`) ficam em `_app.helpers.tsx` separado.

### Negativas / Trade-offs

- Gate de 500 LOC abre exceção formal. Outros arquivos vão pedir mesma
  exceção — esta ADR é precedente para "composition root pode passar".
  Mitigação: outras exceções devem ser propostas via novo ADR específico.

### Neutras

- Refator profundo (Opção B/C) fica como follow-up se complexidade dobrar.

## Validação

- `_app.tsx` permanece ≤ 600 LOC. Acima disso, abrir nova ADR para reavaliar.
- Próximas adições à rota devem preferir extração para `_app.helpers.tsx`
  (puros) ou para componente em `packages/features/*` (visuais).

## Referencias

- `scripts/check-file-lines.ts:14` — entrada em EXEMPTIONS.
- `apps/desktop/src/renderer/routes/_app.helpers.tsx` — helpers extraídos.
- ADR-0006 Package boundaries.
- code-review-3.md TASK-CR3-21.

---

## Histórico de alterações

- 2026-04-26: Proposta inicial e aceita junto com extração de helpers.
