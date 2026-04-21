# ADR 0120: Legacy transcript parity — snapshot harness via SSR

## Metadata

- **Numero:** 0120
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v2 consolidou o stack de markdown (ADR-0115) em `react-markdown + remark-gfm + rehype-raw + Shiki + customBlockRegistry`. Consolidar não basta: transcripts reais da v1 precisam continuar renderizando sem regressão, incluindo blocos custom (`partnercards`) e casos de streaming parcial. Sem gate automatizado, um upgrade futuro de `react-markdown` ou de `remark-gfm` pode quebrar a renderização de chats antigos silenciosamente.

TASK-11-00-11 pede um corpus de casos representativos + harness que rode em CI e falhe em regressão.

## Opções consideradas

### Opção A: Teste visual com Playwright + golden screenshots

**Descrição:** rodar a UI no browser e comparar screenshots.

**Pros:**
- Pega regressões visuais reais (CSS, fonts, layout).

**Contras:**
- Frágil — qualquer ajuste de CSS invalida screenshots.
- Lento no CI (minutos).
- Requer infra de imagem + browser em CI.

### Opção B: Snapshot estrutural (HTML string) via `renderToStaticMarkup`

**Descrição:** rodar `renderToStaticMarkup(<MarkdownRenderer content={fixture} />)` e gravar HTML. Regressão = HTML muda.

**Pros:**
- Rápido (< 1s para o corpus inteiro).
- Zero infra adicional — `react-dom/server` já é dep existente.
- Falhas descritas em diff textual legível.
- Independente de CSS — mudança de tailwind não quebra.

**Contras:**
- Não pega regressão visual pura (cores, espaçamento).
- Componentes client-only (Shiki via `useEffect`) caem no fallback determinístico em SSR — snapshot não cobre o caminho highlighted.

### Opção C: `@testing-library/react` + `happy-dom`

**Descrição:** render full DOM em test runtime.

**Pros:**
- Simula comportamento client mais fielmente.

**Contras:**
- Adiciona `happy-dom` + `@testing-library/react` como devDeps.
- `useEffect` + async de Shiki exige `waitFor` (flaky).
- Overhead sem benefício real para "o HTML estrutural está igual?".

## Decisão

Optamos pela **Opção B** (`renderToStaticMarkup` + snapshots).

Reasoning:

1. O objetivo é pegar regressões estruturais do parser markdown (tabela some, lista vira plain, custom block sai errado). Estrutural = texto, não pixel.
2. `renderToStaticMarkup` não precisa de jsdom/happy-dom — é pura string de HTML. Uma linha: `expect(html).toMatchSnapshot()`.
3. Shiki cai no fallback `<pre><code>` em SSR (porque `useEffect` não roda) — isso **estabiliza** o snapshot. Variação do tema Shiki não quebra a regressão do parser.
4. Fallback de custom block (partnercards sem renderer registrado → CodeBlock genérico) vira teste assertivo — a regra fica documentada no código e cravada via snapshot.

## Corpus de fixtures

9 casos de markdown + 3 de tool result:

| Fixture | Cobertura |
|---|---|
| plain-prose | Títulos, bold, italic, link |
| gfm-table | Tabela com alinhamentos (`:---:`, `---:`) |
| nested-lists | Bullet com ordenada dentro |
| code-fence-closed | ` ```ts ` completo |
| code-fence-incomplete-streaming | ` ``` ` sem fechamento + `isStreaming: true` |
| inline-code | `` ` `` dentro de parágrafo |
| partnercards-unregistered | Custom block sem renderer — fallback |
| mixed-rich-content | Parágrafo + tabela + lista + code fence |
| raw-html | `<strong>` / `<em>` inline via rehype-raw |
| tool-result-string | `FallbackRenderer` + string |
| tool-result-json | `FallbackRenderer` + objeto |
| tool-result-error | `FallbackRenderer` + `{ error }` — abre expandido |

## Testes adicionais (não-snapshot)

Três comportamentos verificados fora do snapshot para deixar intenção explícita:

- `sanitizes an open code fence without throwing` — streaming com ``` aberto não crasha o render.
- `drops incomplete fence when streaming` — o `<pre>` não aparece até a cerca fechar.
- Custom block registry: register/unregister + opção `customBlocks: false` forçando fallback.

## Consequências

### Positivas

- Upgrade de `react-markdown` / `remark-gfm` / `rehype-raw` vira PR com diff de snapshot revisável.
- Regressão de fallback de custom block desconhecido é gate de CI — ninguém derruba sem intenção.
- Setup zero: não precisa de jsdom, de testing-library, de browser automation.
- `customBlockRegistry.unregister()` foi adicionado em ADR-0115 para permitir cleanup nos specs — fica agora documentado aqui como requisito público.

### Negativas / Trade-offs

- Não pega regressão visual pura (espaçamento, cor de mark, etc.). Trade-off aceito: visual fica para Playwright noturno quando montarmos.
- Shiki highlighted output não é coberto. Mitigação: a regra "Shiki quebrou" vira bug de runtime e não de parser, e o fallback já está testado.

### Neutras

- Snapshots vivem em `packages/features/src/chat/__tests__/transcript/__snapshots__/` — committados junto com o código.
- Corpus é inline TypeScript (não JSONL). Justificativa: fixtures são pequenos, legíveis no IDE, versionados no diff do PR. JSONL viraria arquivo que ninguém abre.

## Estrutura implementada

```
packages/features/src/chat/__tests__/transcript/
├── fixtures.ts                          # MARKDOWN_FIXTURES + TOOL_RESULT_FIXTURES
└── legacy-transcript-parity.test.tsx    # renderToStaticMarkup + toMatchSnapshot
```

`packages/features/vitest.config.ts` criado para expor o include glob (`src/**/*.test.tsx` + `src/**/__tests__/**`).

## Validação

- Gate `pnpm test`: corpus roda em < 1s. Qualquer mudança estrutural falha CI com diff textual.
- Gate `check:file-lines`: todos os arquivos ≤200 LOC.
- Vitest snapshots committados — reviewable no PR.

## Referências

- TASK-11-00-11
- ADR-0115 (markdown rendering stack — o que este harness valida)
- ADR-0113 (tool renderer registry — coberto via `FallbackRenderer`)
- https://vitest.dev/guide/snapshot

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-11 entregue).
