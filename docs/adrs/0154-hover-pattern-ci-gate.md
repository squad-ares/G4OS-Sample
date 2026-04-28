# ADR 0154: Gate CI `check:hover-pattern` — proíbe `hover:bg-foreground/N` em dark mode

## Metadata

- **Numero:** 0154
- **Status:** Accepted
- **Data:** 2026-04-27
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

CLAUDE.md documenta o padrão aprovado para hover/focus em icon-buttons:

> `hover:bg-accent/15 hover:text-foreground` é o pattern aprovado. Evita o
> problema de contraste de `hover:bg-foreground/N` em dark mode.

O problema concreto: em dark mode, `foreground` é branco. `hover:bg-foreground/10`
resulta em cinza muito claro sobre fundo escuro — contraste abaixo de WCAG AA (4.5:1).
`hover:bg-accent/15` usa a variável de tema `accent` (gold no dark mode), que tem
cor própria com contraste adequado.

A regra existia como prosa no CLAUDE.md desde iterações anteriores. Sem gate de CI
era tratada como sugestão — code review podia deixar escapar, e ocorrências históricas
foram identificadas em CR5-12. Arbitrary values com decimal (ex.: `hover:bg-foreground/[0.08]`)
escapavam detecção manual por não baterem no padrão literal `/N`.

## Opções consideradas

### Opção A: Manter como regra de code review (sem gate)

**Pros:**
- Zero overhead de CI.

**Contras:**
- "Regra que não é gate de CI não é regra — é sugestão, e sugestão erode."
  (princípio não-negociável do CLAUDE.md).
- CR5-12 confirmou que ocorrências escaparam revisão manual.
- Arbitrary values com decimal continuariam invisíveis para lint manual.

### Opção B: Gate via Biome custom rule

**Pros:**
- Integrado ao linter existente.

**Contras:**
- Biome não suporta custom rules em CSS class strings de JSX (processa AST
  do TS/JS, não atributos Tailwind). Exigiria plugin customizado complexo.

### Opção C: Gate via script `check-hover-pattern.ts` (escolhida)

**Descrição:** Script tsx que varre `packages/features/src/**/*.{ts,tsx}` +
`apps/desktop/src/renderer/**/*.{ts,tsx}` com dois regex:
- `FORBIDDEN_LITERAL`: `hover:bg-foreground/N` para N ≤ 30 (literal opacity)
- `FORBIDDEN_ARBITRARY`: `hover:bg-foreground/[0.X]` (Tailwind arbitrary values)

Exceção: `hover:bg-foreground/90|95|100` — opacidades altas mantêm contraste.

**Pros:**
- Detecta ambas formas (literal e arbitrary value) que escapavam inspeção manual.
- Zero nova dependência (tsx já em uso).
- CI falha imediatamente com arquivo + linha + snippet.

**Contras:**
- Regex pode ter falso negativo para edge cases não previstos (mitigado por
  dois padrões independentes).

## Decisão

**Opção C**. Script `scripts/check-hover-pattern.ts` adicionado ao root
`package.json` como `check:hover-pattern` e executado no pipeline CI.

Padrão proibido: `hover:bg-foreground/N` para N ≤ 30 (literal ou arbitrary value).

Padrão aprovado: `hover:bg-accent/12`, `hover:bg-accent/15`, `hover:bg-accent/20`
conforme densidade desejada. Para elementos com estado normal já muted,
usar `hover:text-foreground` (sem mudança de fundo) ou `hover:bg-accent/12`.

## Consequências

### Positivas

- Regressões de contraste em dark mode detectadas em `pnpm lint` / CI,
  não em produção ou code review tardio.
- Arbitrary values com decimal cobertos automaticamente.
- Alinha com princípio "forcing functions > prosa" do CLAUDE.md.

### Negativas / Trade-offs

- Cada novo componente que usa `hover:bg-foreground/N` baixo falha o gate —
  o dev precisa saber o motivo. Mitigado pelo comentário no script que explica
  o problema de contraste e o padrão correto.
- Gate cobre apenas `features/` e `renderer/` — componentes em `packages/ui/`
  não estão no scope. Decisão: `ui/` é base shared library; componentes ali
  têm contexto de theming diferente e são revisados separadamente.

### Neutras

- Ocorrências existentes foram corrigidas antes de ativar o gate (zero violations
  na ativação).

## Validação

- `pnpm check:hover-pattern` retorna 0 violations.
- Adicionar `hover:bg-foreground/5` em qualquer arquivo de `features/` ou
  `renderer/` deve quebrar o gate.

## Referencias

- CLAUDE.md seção "Padrões de UI (ARIA + Acessibilidade)" — padrão aprovado.
- `scripts/check-hover-pattern.ts` — implementação do gate.
- code-review-5 CR5-12 — ocorrências históricas que motivaram o gate.
- WCAG 2.1 SC 1.4.3 Contrast (Minimum).

---

## Histórico de alterações

- 2026-04-27: Proposta e aceita. Gate ativo sem violations no baseline.
