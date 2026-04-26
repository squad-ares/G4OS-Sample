---
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/translate': patch
---

Cinco quick-wins de paridade visual com a V1 no chat, mais saneamento de
shape entre `@g4os/features/chat` e `@g4os/kernel`.

1. **Tool blocks no transcript.** `AssistantMessage` passa a iterar blocos
   `tool_use` via novo `ToolUseBlock` (ícone Wrench + collapsible com JSON
   dos args). Novo `ToolMessage` renderiza mensagens com `role='tool'` via
   `ToolResultDispatcher` — que já existia mas nunca era importado em
   nenhum render path. Side-effect import de `tool-renderers/index.ts`
   garante que renderers built-in (bash, read-file, search-results) se
   auto-registrem antes do primeiro despacho.

2. **WorkspaceSwitcher na sidebar.** Antes só era acessível pelo footer
   do sub-sidebar (low affordance). Agora há um badge de workspace
   clicável no rail principal (78px, abaixo do brand mark) que abre o
   dialog existente. `AppShell` propaga o prop `workspace` pra
   `WorkspaceSidebar` em adição ao `SubSidebarFooter`.

3. **ChatWelcomeState.** Substitui o texto cinza "No messages yet" por
   4 prompt cards (Explicar código / Brainstorm / Resumir / Planejar)
   quando o transcript está vazio. Click envia o prompt direto via
   `handleSend`. `TranscriptView` ganha props `onSelectSuggestedPrompt`
   e `suggestedPrompts`.

4. **SessionHeader.** Header novo no topo da página de sessão com nome
   editável inline (Enter commit / Escape cancela), badges
   provider/model, tag de working directory truncada, botões
   retry-last-turn e archive. 5 chaves i18n novas em pt-BR e en-US.

5. **SessionsPanel agrupado.** Sub-sidebar agora agrupa sessões por dia
   (Today / Yesterday / Earlier this week / Earlier this month / mês
   anterior por nome). Cada item mostra ícones unread/pinned/starred/
   branched.

**Saneamento (bonus).** `packages/features/src/chat/types.ts` passa a
espelhar exatamente o shape do `ContentBlock` do kernel. `ThinkingBlock`
tinha bug latente lendo `block.thinking` quando o data tem `block.text` —
corrigido. `ToolUseBlock` usava `id`/`name`; alinhado para
`toolUseId`/`toolName`. `MessageRole` ganhou `'tool'`.
`kernel-to-chat-mapper` virou pass-through (era a fonte da divergência)
e seus testes foram atualizados.

**Refactors.** Para manter o route file da sessão abaixo do gate de 500
LOC, dois hooks foram extraídos:
- `useSessionHeader` (rename + archive callbacks + model/provider
  resolution)
- `useComposerAffordances` (working-dir options, source-selection
  change, custom-dir picker)

Bump `@g4os/desktop` para 0.0.7-beta.
