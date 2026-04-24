# ADR 0115: Markdown rendering stack (remark + rehype + Shiki + custom blocks)

## Metadata

- **Numero:** 0115
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 tinha três parsers de markdown ativos em paralelo: `marked` na transcript principal, `markdown-it` em um bloco específico de export, e `strip-markdown` para preview. Consequências:

- ~250 KB gzipped extra no bundle.
- Comportamento divergente entre views — uma tabela renderizava em um lugar e falhava em outro.
- Custom blocks (`partnercards`, `infocards`) viviam num `replaceAll` com regex frágil, acoplados ao renderer principal.
- Streaming de code fence aberto (``` sem fechamento) fazia o parser travar em loop infinito em casos raros.

TASK-11-00-05 consolida para um único pipeline robusto, com GFM completo, HTML embutido controlado e custom blocks via registry desacoplado.

## Opções consideradas

### Opção A: `marked` + plugins

**Descrição:** manter `marked` e adicionar `marked-gfm-heading-id` etc.

**Pros:**
- Rápido (C-like parser).

**Contras:**
- Output é HTML string — precisa de `dangerouslySetInnerHTML` em tudo, sem interposição React.
- Custom blocks continuam em regex externa.
- Não se integra bem com o loop de highlighting assíncrono (Shiki).

### Opção B: `react-markdown` + `remark-gfm` + `rehype-raw` + Shiki lazy

**Descrição:** parser React-first que devolve árvore de componentes. `remark-gfm` adiciona tabelas, task lists, strikethrough. `rehype-raw` permite HTML inline controlado. Shiki é carregado sob demanda via `await import`.

**Pros:**
- Output é árvore de componentes React — cada node pode ser sobrescrito via `components` prop.
- Custom blocks viram "code blocks com linguagem tagged" (` ```partnercards `) e são dispatchados via `customBlockRegistry` — sem regex, sem acoplamento ao renderer.
- Shiki lazy (`await import(/* @vite-ignore */ 'shiki')`) mantém bundle inicial enxuto; primeiro highlight assíncrono, renders seguintes síncronos (cache em Map).
- `rehype-raw` aceita `<strong>` / `<em>` embutidos sem sanitizar — já que a fonte é confiável (LLM output que passou pelo pipeline de segurança).

**Contras:**
- `react-markdown` + plugins ~70 KB gzipped.
- Primeira render de code block mostra fallback simples enquanto Shiki carrega (uma vez por sessão).

### Opção C: CodeMirror 6 para tudo

**Descrição:** usar CodeMirror também na transcript.

**Pros:**
- Consistência com editor potencial.

**Contras:**
- Overkill; CodeMirror é para interatividade, não para render estático.
- ~300 KB gzipped para renderizar markdown é fora do orçamento.

## Decisão

Optamos pela **Opção B** (`react-markdown` + `remark-gfm` + `rehype-raw` + Shiki lazy + custom block registry).

Reasoning:

1. Um único parser — sem mais divergência entre views.
2. Custom blocks viram uma entrada no registry (`customBlockRegistry.register('partnercards', Component)`), não uma modificação do renderer.
3. Fallback explícito: linguagem sem renderer custom cai no `CodeBlock` Shiki normal (sem throw, sem branco). Demonstrado no corpus de TASK-11-00-11.
4. Streaming é tratado com `sanitizeIncompleteStreaming(content)`: se o número de ``` é ímpar, trunca na última cerca — o parser nunca vê código aberto, logo não trava.
5. Shiki é a escolha de syntax highlighting porque gera HTML estático (não requer runtime client-side), é mantido pelo time do VS Code e tem cache nativo por `(lang, code)`.

## Contrato do custom block registry

```ts
interface CustomBlockRegistry {
  register(lang: string, component: ComponentType<{ children: string }>): void;
  unregister(lang: string): boolean;  // retorna true se existia
  getRenderer(lang: string): ComponentType<{ children: string }> | undefined;
  has(lang: string): boolean;
}
```

- `unregister` foi adicionado em TASK-11-00-11 para permitir cleanup em testes sem tocar o interior da classe.
- Fallback implícito: `customBlockRegistry.has(lang) === false` → cai no `CodeBlock` (Shiki).
- Opção `customBlocks={false}` no `MarkdownRenderer` força fallback mesmo para linguagens registradas (modo "raw view").

## Consequências

### Positivas

- Bundle de markdown unificado: ~150 KB gzipped total (antes: ~400 KB entre os três parsers).
- Custom blocks sem regex — ADR-0119 aproveitou o mesmo custom block registry sem tocar o renderer.
- Streaming robusto: corpus de fixtures (TASK-11-00-11) inclui `code-fence-incomplete-streaming` e passa sem throw.
- Shiki lazy elimina o custo no primeiro paint para mensagens sem código.

### Negativas / Trade-offs

- Primeiro render de cada `(lang, code)` mostra fallback `<pre><code>` por ~100-300ms até o highlight assíncrono terminar. Aceitável para V1; cache amortiza renders subsequentes.
- `rehype-raw` + HTML embutido depende da confiança no output do LLM. Se um dia a transcript receber conteúdo user-provided sem sanitização, isso vira vetor XSS. Mitigação: `rehype-sanitize` pode ser plugado se necessário.
- `dangerouslySetInnerHTML` é usado dentro do `CodeBlock` para injetar o HTML do Shiki — justificado por comentário `biome-ignore` com razão explícita.

### Neutras

- `MarkdownRenderer` e `CodeBlock` vivem em `@g4os/ui/markdown` para serem compartilháveis entre `features` e o viewer web futuro. A feature chat só re-exporta.

## Estrutura implementada

```
packages/ui/src/markdown/
├── markdown-renderer.tsx     # ReactMarkdown + remarkGfm + rehypeRaw + code component factory
├── code-block.tsx            # Shiki highlighter lazy + copy button
├── use-highlighted-html.ts   # cache Map<`${lang}:::${code}`, string> + lazy import
├── custom-block-registry.ts  # register / unregister / getRenderer / has
└── index.ts                  # barrel
```

## Validação

- Gate `check:file-lines`: todos os arquivos ≤100 LOC.
- Gate `check:cruiser`: markdown não importa `features`, `ipc` nem `electron`.
- Vitest: corpus de fixtures em TASK-11-00-11 cobre 9 cenários (prose, table, lista aninhada, code fence fechado, streaming incompleto, inline code, partnercards sem registro, mixed rich, raw HTML).

## Referências

- TASK-11-00-05
- ADR-0103 (@g4os/ui consolidação)
- ADR-0120 (legacy transcript parity — valida este pipeline)
- https://shiki.style (Shiki docs)
- https://github.com/remarkjs/react-markdown

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-05 entregue + ajustes pós TASK-11-00-11).
