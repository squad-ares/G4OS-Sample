# ADR 0112: Transcript rendering com virtualização + ações de sessão

## Metadata

- **Numero:** 0112
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A transcript da v1 renderizava todas as mensagens de uma sessão em um array flat sem virtualização. Sessões longas (300+ turnos, que são normais em dia a dia de uso) ocasionavam dois bugs:

- Re-render completo a cada novo delta de streaming, travando o event loop por centenas de ms.
- Scroll "grudado" em baixo rompia sempre que o usuário rolava para cima — o check de "estou perto do final?" misturava leitura síncrona com decisão de `scrollIntoView`.
- Sem separadores de data, sessões que atravessavam múltiplos dias viravam um muro de mensagens sem landmarks.
- Ações de mensagem (copy / retry / branch) estavam duplicadas em cada cartão via render direto, o que acoplava a mensagem ao owner da sessão (o renderer dependia de callbacks globais).

TASK-11-00-02 + TASK-11-00-08 foram tratadas em conjunto porque render e ações compartilham a mesma superfície de componente (`MessageCard`) e o mesmo trade-off entre prop drilling e globalização de estado.

## Opções consideradas

### Opção A: Lista flat com React.memo no MessageCard

**Descrição:** manter o render O(N), só evitar o re-render das mensagens já assentadas via `React.memo` e comparador explícito.

**Pros:**
- Zero dependência adicional.
- Fácil de debugar — o DOM é estável 1:1 com o array de mensagens.

**Contras:**
- DOM cresce sem teto. 500 mensagens = 500 nós mesmo fora da viewport.
- Scroll-to-match e auto-scroll viram gargalo O(N) em cada mutação do array.
- Memory pressure no Chromium/Electron é proporcional ao tamanho da transcript, o que reacende o bug raiz do v1 (listener leak em sessões longas).

### Opção B: @tanstack/react-virtual

**Descrição:** virtualização window-based que calcula items visíveis em função de `scrollTop`. Overscan configurável. Usa IntersectionObserver internamente.

**Pros:**
- O(1) no render — só os itens visíveis vão ao DOM.
- API declarativa (`useVirtualizer`) que encaixa com a estrutura existente.
- `scrollToIndex` nativo, que encaixa com a busca (ADR-0119) e com replay de eventos.
- Mantido pelo mesmo time do TanStack Query/Router que já é decisão do projeto (ADRs 0101 / Query).

**Contras:**
- Items com altura variável precisam de `estimateSize` + `measureElement` — erro cumulativo se o estimate for ruim.
- Mensagens com conteúdo dinâmico (tool results colapsáveis, streaming text) podem mudar altura depois do measurement inicial.

### Opção C: react-window

**Descrição:** alternativa madura, também virtualização window-based.

**Pros:**
- Package menor que `@tanstack/react-virtual`.

**Contras:**
- API menos composta com React 19 (force-update manual para measure dinâmico).
- Manutenção estagnada; última versão major foi 2020.

## Decisão

Optamos pela **Opção B** (`@tanstack/react-virtual`).

Reasoning:

1. Render O(1) elimina o travamento de sessões longas sem exigir novo pacote de observabilidade para medir desempenho.
2. `estimateSize` baseado em `role` (user = 60px) + `text length * 0.4` entrega margem decente; `measureElement` corrige para cima quando o conteúdo real é maior.
3. `scrollToIndex({ align: 'center' })` fecha o loop com busca (ADR-0119) sem precisar de `getElementById`.
4. Date separators são virtualizados junto com as mensagens via `VirtualItem` union (`Message | DateSepItem`) — o separator reutiliza a mesma máquina de scroll/overscan.

Para ações de sessão (copy / retry / branch), optamos por **callbacks opcionais injetados** (`MessageCardCallbacks`). O `MessageCard` só renderiza o botão se o callback está presente:

```ts
export interface MessageCardCallbacks {
  readonly onRetry?: (messageId: string) => void;
  readonly onBranch?: (messageId: string) => void;
}
```

Isso:
- Mantém `packages/features` transport-agnostic (nenhum import de `trpc` ou IPC dentro do cartão).
- Permite desligar retry/branch em contextos onde não fazem sentido (ex: transcript read-only, viewer web).
- Deixa o orquestrador (desktop renderer) decidir como materializar a ação — tRPC mutation, broadcast em sessões compartilhadas, etc.

Copy é sempre-on (não precisa de callback) porque é client-side puro (`navigator.clipboard`).

## Consequências

### Positivas

- Transcript de 1000+ turnos roda suave no Electron em máquina média (teste manual em sessões reais).
- `TranscriptView` expõe uma API estreita (`sessionId`, `messages`, `isStreaming`, `callbacks`, `search`) — fácil de consumir em múltiplas shells (desktop, viewer web futuro).
- `useAutoScroll` ficou um hook isolado, testável e reusável para permission modal se precisar de auto-scroll.
- Hover-reveal das ações (`opacity-0 group-hover:opacity-100`) elimina o teto visual de 3 botões por mensagem que a v1 sofria.

### Negativas / Trade-offs

- Altura estimada errada gera jitter no scroll quando o texto vira muito maior que o estimate. Mitigado com `overscan: 5` e `measureElement`.
- Adiciona 1 dep (`@tanstack/react-virtual`) que precisa ser mantida atualizada com React 19.
- Mensagens muito longas com código + tabela podem estourar o `max(800, ...)` do estimate e criar gap visual temporário até o measurement real.

### Neutras

- Date separators foram modelados como `VirtualItem` para reusar o pipeline de scroll e overscan. Alternativa seria render fora do virtualizer — menos código, mas obrigaria cálculo separado de scroll-to-date no futuro.
- Streaming marker (cursor piscando no último turno) vai pelo `isStreaming && vi.index === items.length - 1` check — barato, mas pressupõe que a última mensagem é sempre a que está streamando (hoje é verdade).

## Estrutura implementada

```
packages/features/src/chat/
├── components/transcript/
│   ├── transcript-view.tsx            # virtualizer + search host (~180 LOC)
│   ├── message-card/
│   │   ├── message-card.tsx           # hover-reveal actions toolbar
│   │   ├── assistant-message.tsx      # thinking + text blocks
│   │   ├── user-message.tsx
│   │   └── thinking-block.tsx
│   ├── actions/
│   │   ├── copy-button.tsx
│   │   ├── retry-button.tsx
│   │   └── branch-button.tsx
│   └── separators/date-separator.tsx
└── hooks/use-auto-scroll.ts           # near-bottom detection + sticky scroll
```

i18n adicionado: `chat.transcript.ariaLabel`, `chat.transcript.empty`, `chat.actions.retry`, `chat.actions.branch`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤300 LOC.
- Gate `check:cruiser`: `MessageCard` não importa tRPC nem Electron.
- Gate `check:i18n`: zero strings hardcoded.
- Smoke manual: sessão com 500+ mensagens + scroll + busca não trava.

## Referências

- TASK-11-00-02, TASK-11-00-08
- ADR-0111 (composer arquitetura)
- ADR-0109 (translate + proibição de strings hardcoded)
- ADR-0119 (transcript search consome o virtualizer)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-02 + TASK-11-00-08 entregues).
