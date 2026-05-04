---
'@g4os/desktop': patch
'@g4os/translate': patch
---

UX fixes — streaming flicker, onboarding flow e sub-sidebar

**Chat streaming — 3 fixes de flicker:**
- Ghost message aparece imediatamente em `turn.started` (antes esperava primeiro texto, ~16ms de delay visível). `AssistantMessage` já renderiza "thinking" dots quando `content=[]` + `isStreaming=true`.
- Ghost só some após `invalidateMessages` resolver — evita flicker onde a resposta da IA desaparecia brevemente entre ghost→mensagem persistida do DB. `setStreamingTurnId(null)` movido do `turn.done` para o `.then()` de `invalidateMessages` no handler `message.added`.
- `createdAt` do ghost capturado uma vez em `turn.started` via `streamingStartedAtRef` em vez de `Date.now()` inline no `useMemo` (que gerava timestamp novo a cada RAF tick propagando prop instável para filhos).

**Onboarding — paridade V1:**
- `routes/index.tsx`: quando não há workspaces, redireciona para `/workspaces/new` (wizard) em vez de criar "My Workspace" silenciosamente. Restaura o fluxo V1 de impedir acesso ao shell sem configurar um workspace.
- `workspaces.new.tsx`: após completar o wizard, navega diretamente para o workspace recém-criado via `setActiveWorkspaceId` + `navigate($workspaceId)` em vez de ir para a lista (que ignorava o ID com `void workspaceId`).

**Sub-sidebar:**
- `_app.tsx`: botão "nova sessão" no `SessionsPanel` agora tem o mesmo guard de `activeWorkspaceSlug` que o botão da `WorkspaceSidebar` — antes aparecia sempre, independente de haver workspace ativo.

**translate:**
- `pt-br.ts`: correção de label da categoria config em settings.
