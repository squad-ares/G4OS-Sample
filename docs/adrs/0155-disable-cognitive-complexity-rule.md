# ADR 0155: Desabilitar `noExcessiveCognitiveComplexity` no Biome

## Metadata

- **Numero:** 0155
- **Status:** Accepted
- **Data:** 2026-04-28
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

CR12 (multi-agent deep pass) auditou o uso de `biome-ignore` no monorepo:

| Regra | Supressoes | Padrao |
|---|---|---|
| `lint/complexity/noExcessiveCognitiveComplexity` | **13** | Sempre justificada com mesma estrutura |
| `lint/style/noProcessEnv` | 6 | Composition root, narrowly scoped |
| `lint/suspicious/noConsole` | 5 | Renderer auth-store + dev fallbacks |
| `lint/suspicious/noExplicitAny` | 4 | tRPC v11 internals + test internals |
| `lint/correctness/useExhaustiveDependencies` | 4 | Reset triggers intencionais |
| outras | 1-2 | Casos isolados |

A regra `noExcessiveCognitiveComplexity` aparece com **13 supressoes em 13 arquivos diferentes**, cada uma com `(reason: ...)` argumentando a mesma logica: "fluxo linear que perde clareza se quebrado em sub-funcoes". Arquivos afetados:

- `packages/features/src/chat/components/composer/composer.tsx`
- `packages/features/src/chat/components/transcript/{session-header,session-active-badges,session-metadata-panel}.tsx`
- `packages/features/src/sessions/components/session-context-menu.tsx`
- `packages/agents/src/claude/runner/stream-runner.ts`
- `packages/agents/src/codex/app-server/client.ts`
- `packages/observability/src/sentry/scrub.ts`
- `packages/sources/src/oauth/loopback.ts`
- `packages/data/src/events/event-store.ts`
- `packages/credentials/src/migration/migrator.ts`
- `apps/desktop/src/renderer/routes/_app/workspaces.$workspaceId.sessions.$sessionId.tsx`
- `apps/desktop/src/main/ipc-context.ts`

O padrao indica que a regra detecta legitimamente codigo com fluxo linear nao-trivial (stream pumps, event-source replays, FSM orchestrators, route components com 5+ effects/queries) — mas a remediacao "extrair sub-funcoes" piora a leitura em todos os casos, porque o controle linear se quebra entre escopos.

CLAUDE.md princilio nao-negociavel #1: "Forcing functions > prosa. Regra que nao e gate de CI nao e regra — e sugestao, e sugestao erode." Logica recursiva: regra que e gate mas e SEMPRE suprimida tambem nao e forcing function — e ruido com dois custos:

1. **Tempo de revisao:** cada nova ocorrencia exige reason justificada que repete o anterior
2. **False signal:** linting com 13+ supressoes da impressao falsa de "codigo complexo demais" quando o team ja decidiu que e aceitavel

## Opções consideradas

### Opção A: Manter regra ligada com supressoes inline (status quo)

**Pros:**
- Cobertura semantica retida — futuras complexidades genuinamente refatoraveis ainda alertam.

**Contras:**
- 13 supressoes existentes em 13 arquivos diferentes — pattern claro de "ruido sistemico".
- Cada nova feature complexa exige nova supressao + reason — overhead recorrente sem ganho.
- Dificulta pedir refator legitimo no futuro porque o time esta acostumado a suprimir.

### Opção B: Tightening do threshold em vez de desabilitar

**Pros:**
- Mantem detecao para casos extremos (50+, 100+).

**Contras:**
- Biome nao expoe threshold configuravel para `noExcessiveCognitiveComplexity` (e binario on/off).
- Exigiria fork ou wrapper — overhead sem retorno proporcional.

### Opção C: Desabilitar globalmente e remover supressoes (escolhida)

**Descrição:** Setar `lint/complexity/noExcessiveCognitiveComplexity: "off"` em `biome.json`. Remover as 13 linhas `// biome-ignore lint/complexity/noExcessiveCognitiveComplexity:` (mantendo o codigo intacto).

**Pros:**
- Reducao de ruido visual nos arquivos com fluxo linear legitimo.
- Zero supressoes para auditar — gate do biome fica mais limpo.
- Outras regras de complexity (`useArrowFunction`, `noUselessTernary`, etc) continuam ativas — nao perde cobertura util.

**Contras:**
- Perda de detecao de complexidade em codigo NOVO. Mitigacao: code review humano + revisoes recorrentes (CR-N) ja capturam casos legitimos.

## Decisão

**Opção C**. `noExcessiveCognitiveComplexity` desabilitada. As 13 linhas `biome-ignore` removidas no mesmo PR.

## Consequências

### Positivas

- 13 linhas de comment cleanup removidas dos arquivos afetados.
- Velocidade de iteracao em features complexas (composer, settings panel, route page) sem overhead de justificar supressao.
- Alinhamento com principio "sugestao erode" — regra inutil e sinal contrario do principio.

### Negativas / Trade-offs

- Codigo NOVO com complexidade > 15 (threshold default do Biome) nao e mais flagged automaticamente. Code review humano cobre.
- Se complexidade acumular em hot paths, sera detectado em CR-N reviews em vez de em PR.

### Neutras

- Outras regras de `lint/complexity/*` (`noUselessTernary`, `useArrowFunction`, `noUselessCatch`, etc) permanecem ativas.
- Gate `pnpm lint` continua bloqueando PRs com warnings — apenas a regra especifica fica off.

## Validação

- `pnpm lint` retorna 0 errors, 0 warnings apos remocao das supressoes.
- Grep `biome-ignore lint/complexity/noExcessiveCognitiveComplexity` retorna zero ocorrencias.

## Referencias

- CLAUDE.md, principio #1: "Forcing functions > prosa".
- code-review-12.md, secao "biome-ignore audit".
- Biome docs: https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/

---

## Histórico de alterações

- 2026-04-28: Proposta e aceita junto com remocao das 13 supressoes existentes.
