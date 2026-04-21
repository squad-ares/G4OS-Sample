# ADR 0111: Chat Composer Architecture

## Metadata

- **Numero:** 0111
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

O Composer da v1 tinha ~3000 LOC distribuídos em vários arquivos, com draft persistence, mentions, voice input e attachments misturados no mesmo componente. Isso causava:

- Re-renders excessivos em chains de state global de attachments
- Draft salvo a cada keystroke bloqueando a UI thread
- Impossibilidade de testar draft persistence em isolamento (acoplado a `localStorage` direto)
- Submit mode (Enter vs Cmd+Enter) espalhado em lógica condicional inline
- IME composition events não tratados, causando duplo-submit em teclados asiáticos

A v2 inicia o chat feature (Epic 11) com TASK-11-00-01, entregando a fundação modular do Composer antes de mentions, attachments e voice input (tasks irmãs).

## Opções consideradas

### Opção A: contentEditable div

**Descrição:** Usar `<div contentEditable>` como base, igual ao Slack e Notion, para suportar rich text (mentions inline, formatação).

**Pros:**
- Suporta mentions inline nativamente (DOM nodes misturados com texto)
- Possibilita formatação markdown em tempo real

**Contras:**
- Acessibilidade degradada (precisa de ARIA manual, `aria-multiline`, `role=textbox`)
- Comportamento de Enter/IME não-padrão — cada browser e SO tem quirks
- Impossível usar `value` controlado de React diretamente; precisa serializar/deserializar DOM
- Testabilidade baixa: `fireEvent.input` não dispara como em textarea

**Custo de implementação:** Alto; precisa de parser de mentions inline antes de qualquer uso.

### Opção B: `<textarea>` nativa com auto-resize

**Descrição:** `<textarea>` controlada via React, com resize por `scrollHeight` e submit-mode tipado.

**Pros:**
- Acessibilidade nativa (`aria-label`, `aria-disabled`, `aria-live` sem ARIA manual)
- `value` controlado: estado previsível, testável via `userEvent.type`
- IME tratável via `event.nativeEvent.isComposing`
- Auto-resize via `scrollHeight` e `rows` — padrão em Chat GPT, Claude.ai, Linear

**Contras:**
- Mentions e formatação inline precisam de overlay separado (não inline no DOM do texto)
- Limite visual em telas muito pequenas com muito texto

**Custo de implementação:** Baixo; textarea + ref + scrollHeight é idiomático React.

### Opção C: CodeMirror 6

**Descrição:** Editor de código como base (CodeMirror 6), com extensões para mentions e formatação.

**Pros:**
- Poderoso, extensível, usado em VS Code e Replit
- Mention extension já existe no ecossistema

**Contras:**
- Overhead de ~300 KB gzipped para um campo de texto
- API não-React (estado próprio, integrar com React Hook Form é complexo)
- Overkill para fase 1; task de mentions não requer rich editing

**Custo de implementação:** Alto; integração com tRPC/RHF exigiria wrapper não-trivial.

## Decisão

Optamos pela **Opção B** (`<textarea>` nativa com auto-resize).

Reasoning:

1. Acessibilidade zero-custo: `aria-label`, `aria-disabled` e `aria-live` funcionam nativamente.
2. Testabilidade: estado controlado por React + `userEvent.type` em Vitest.
3. IME-safety via `event.nativeEvent.isComposing` — problema documentado na v1.
4. Mentions e attachments são tasks irmãs (TASK-11-00-03/04); nenhuma requer contentEditable agora.
5. Upgrade path claro: quando mentions inline forem necessários, CodeMirror pode substituir apenas `ComposerTextarea` sem alterar `Composer`, `DraftStore` nem `useComposerState`.

## Consequências

### Positivas

- `ComposerTextarea` é isolada e substituível sem tocar o orquestrador.
- `DraftStore` como interface (não implementação) permite trocar de `localStorage` para IPC-backed (`@g4os/data`) quando TASK-10B-10 chegar, sem alterar `Composer`.
- `ComposerSubmitMode` como union type garante que todo path de submit (Enter/Cmd+Enter) é explicitamente testado.
- 500ms debounce em `useComposerState` evita o bug de v1 (salvar a cada keystroke).
- `isComposing` check em `shouldSubmit` corrige o bug de duplo-submit em teclados CJK.

### Negativas / Trade-offs

- Mentions inline (TASK-11-00-03) precisarão de overlay posicionado absolutamente — não podem ser DOM nodes dentro do textarea.
- Formatação markdown em tempo real fica fora do escopo desta base; requer reconsideração em ADR futuro.

### Neutras

- `localStorageDraftStore` é o default injetado, mas `Composer` aceita qualquer `DraftStore` via prop, permitindo testes sem localStorage real.
- `SendButton` usa `ArrowUp` para enviar e `Square` para interromper — visual consistente com v1 e com o design system.

## Estrutura implementada

```
packages/features/src/chat/
├── components/
│   └── composer/
│       ├── composer.tsx          # orquestrador (<100 LOC)
│       ├── composer-textarea.tsx # textarea auto-resize (forwardRef, 1-10 rows)
│       ├── send-button.tsx       # ArrowUp / Square swap quando isProcessing
│       ├── draft-persistence.ts  # DraftStore interface + localStorageDraftStore
│       ├── submit-mode.ts        # ComposerSubmitMode + shouldSubmit + shouldInsertNewline
│       └── index.ts              # barrel
├── hooks/
│   └── use-composer-state.ts     # texto + debounce 500ms + reset + isPristine
└── index.ts                      # subpath barrel re-exportado por packages/features
```

Chaves de i18n adicionadas em `@g4os/translate` (en-US + pt-BR):
- `chat.composer.placeholder`
- `chat.composer.ariaLabel`
- `chat.composer.send`
- `chat.composer.stop`
- `chat.composer.submitHint.enter`
- `chat.composer.submitHint.cmdEnter`

## Validação

- Gate `check:file-lines`: todos os arquivos do composer abaixo de 150 LOC.
- Gate `check:circular`: sem ciclo entre `composer`, `draft-persistence`, `submit-mode` e `use-composer-state`.
- Gate `check:cruiser`: `features` não importa `electron`, `main/` nem outras features.
- Gate `check:i18n`: zero strings UI hardcoded no compositor.
- Vitest: testes unitários de `shouldSubmit` / `shouldInsertNewline` e `localStorageDraftStore`.

## Referencias

- TASK-11-00-01 (`STUDY/Audit/Tasks/11-features/00-chat/TASK-11-00-01-composer.md`)
- ADR-0103: UI package Radix/shadcn consolidation
- ADR-0109: translate package e proibição de strings hardcoded
- ADR-0110: global actions e baseline de acessibilidade
- Tasks irmãs: TASK-11-00-03 (mentions), TASK-11-00-04 (attachments), TASK-11-00-05 (voice)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-01 entregue)
