# ADR 0156: Chat canvas máximo — sem SessionHeader, chrome leve via SessionActiveBadges

## Metadata

- **Numero:** 0156
- **Status:** Accepted
- **Data:** 2026-05-01
- **Autor(es):** @igor.rezende
- **Stakeholders:** @tech-lead, @ux

## Contexto

A V2 introduziu, durante o épico 11-features, um componente `SessionHeader` em [`packages/features/src/chat/components/transcript/session-header.tsx`](../../packages/features/src/chat/components/transcript/session-header.tsx) que renderizava uma bar dedicada por sessão acima do transcript:

- Nome da sessão editável inline (click-to-rename)
- 3 badges (provider · model · working-dir) como chips bordered
- 4 ações icon-only (retry-last, archive, toggle-metadata, more-actions)

Auditoria visual V1↔V2 ([`Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md`](../../../Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md), 2026-05-01) revelou que essa bar é uma **divergência estrutural com a V1**:

- V1 mantém o canvas de chat **máximo** — nenhuma chrome bar entre `SessionsShellTopBar` e o transcript.
- V1 já surfacia model + working-dir como pills no composer (perto do contexto da próxima mensagem).
- V1 tratava rename via context menu na sub-sidebar; archive via menu da lista.
- V1 nunca teve "metadata-toggle" como botão permanente.

Além disso, V2 já renderiza `SessionActiveBadges` logo abaixo de `SessionHeader` — a mesma informação de provider/model/wd duplicada em duas áreas. O usuário identificou explicitamente: _"ainda há conceitos errados como o header do chat por exemplo"_.

Evidência:
- Audit doc `v1-v2-divergence-shell-onboarding.md` — P0 com recomendação de deletar `SessionHeader`.
- `SessionActiveBadges` já existia, oferecendo o mesmo conjunto de chips em formato mais leve (rounded-full, sem bordas grossas, sem `text-[11px]` em `border-foreground/10` chip).
- `SessionMetadataPanel` já é o destino natural para rename (campo editable) — só faltava archive.

## Opções consideradas

### Opção A: Manter `SessionHeader` como bar permanente

**Descrição:** acatar a bar atual; alegar que produtos modernos (Cursor, Linear) costumam ter chrome per-resource.

**Pros:**
- Sem refactor; código existente é estável.
- Ações como retry/archive ficam visíveis em 1 clique.

**Contras:**
- **Divergência explícita com V1**, quebrando paridade visual que o usuário considera prioritária.
- Duplicação de info com `SessionActiveBadges` (provider/model/wd em 2 lugares).
- Ocupa altura do viewport sem justificativa funcional — pickers de model/wd já vivem no composer.
- "metadata-toggle" sem affordance clara do que abre.
- A bar compete visualmente com `SessionsShellTopBar` (a chrome real do shell).

### Opção B: Reduzir `SessionHeader` (manter só nome + 1 botão de menu)

**Descrição:** colapsar a bar pra mostrar apenas nome editável + botão "⋯" de ações.

**Pros:**
- Compromisso entre V1 e V2.
- Mantém affordance visível pra rename.

**Contras:**
- Continua adicionando uma faixa de chrome que V1 não tem.
- Nome da sessão já é visível na sub-sidebar (item ativo highlight).
- Compromisso parcial — produz UX híbrida sem a clareza nem da V1 nem da V2 atual.

### Opção C: Deletar `SessionHeader`; usar `SessionActiveBadges` como chrome único

**Descrição:** remover a bar; expor metadata-toggle + retry-last como ações leves no fim da linha de chips. Rename + archive movem para `SessionMetadataPanel`. Nome da sessão é redundante (já no sidebar).

**Pros:**
- **Paridade direta com V1** — canvas máximo, chrome só onde necessário.
- Elimina duplicação de info (chips só em 1 lugar).
- Ações raras (rename/archive) ficam onde fazem sentido (panel de metadata).
- Reduz ~190 LOC mortos; adiciona ~30 LOC em badges.
- Composer já é o local canônico para pickers — mantém esse princípio.

**Contras:**
- Rename perde affordance "click no nome" — usuário precisa abrir metadata panel.
- Retry-last fica como ícone pequeno no fim da chip line (menos descobrível que botão dedicado).
- Outros features podem estar tentadas a re-adicionar bars no futuro — precisamos do ADR pra ancorar a regra.

## Decisão

Optamos pela **Opção C — Deletar `SessionHeader`; chrome único via `SessionActiveBadges`**.

### Implementação canônica

1. `packages/features/src/chat/components/transcript/session-header.tsx` é deletado; exports removidos de [`chat/index.ts`](../../packages/features/src/chat/index.ts) e [`transcript/index.ts`](../../packages/features/src/chat/components/transcript/index.ts).
2. `SessionActiveBadges` ganha 3 props opcionais novas:
   - `onRetryLast?: () => void` — botão `RotateCcw` (`size-3`) no fim da linha.
   - `onToggleMetadata?: () => void` + `metadataOpen?: boolean` — botão `PanelRight` com `aria-pressed`.
3. `SessionMetadataPanel` aceita `onArchive?: () => void` — botão `Archive` no header do panel (próximo ao `X` close).
4. Rotas de sessão (`workspaces.$workspaceId.sessions.$sessionId.tsx`) deixam de renderizar `SessionHeader`. Wiring vai todo para `SessionActiveBadges` + `SessionMetadataPanel`.
5. `useSessionHeader` (hook) é mantido — continua válido como compositor de `handleRename` + `handleArchive` + labels. JSDoc atualizada.

### Regra forward-looking

**Nenhuma feature nova pode introduzir uma bar permanente entre `SessionsShellTopBar` e o transcript.** Adicionar metadata visível por sessão deve seguir a hierarquia:

1. **Composer (pills/affordances slot):** estado mutável que afeta a próxima mensagem (model, working-dir, sources, thinking-level).
2. **`SessionActiveBadges` (chrome leve):** info read-only sumarizada com link rápido pro picker correspondente. Ações leves (retry, toggle-metadata) cabem aqui se o ícone for `size-3` e couber no fim da linha.
3. **`SessionMetadataPanel` (drawer lateral):** edição (rename, notes), seleção de project, ações administrativas (archive, delete).
4. **Mensagem hover (`MessageCard.actions`):** ações por mensagem (copy, retry-from-here, branch).

Se uma proposta de UI exige um 5º slot, abra novo ADR superseding este antes de implementar.

## Consequências

### Positivas
- Canvas de chat ganha ~50px verticais que viram área útil pro transcript.
- Paridade visual com V1 restaurada para esta área.
- Pattern explícito reduz risco de re-introdução acidental de chrome bar.
- `SessionMetadataPanel` consolida ações administrativas — local único pra rename/archive/notes.

### Negativas / Trade-offs
- Rename agora exige toggle do panel (1 clique extra que V1 também tinha via context menu).
- Archive só descoberto no panel — usuários acostumados com a bar antiga vão precisar reaprender.
- O hook `useSessionHeader` mantém o nome legacy "Header" embora não exista mais Header — renomeação adiada para evitar churn em todos os callsites.

### Neutras
- `SessionActiveBadges` cresceu ~50 LOC (botões + slot direito); ainda dentro do cap 500 LOC do package.
- Tradução: keys `chat.header.retryLast`, `chat.header.archive`, `chat.header.toggleMetadata` permanecem com prefixo `header` mesmo após a remoção do componente — renomeação custaria parity sweep em ambas locales sem ganho funcional. Aceitamos como dívida menor de naming.

## Validação

- **Visual diff manual** comparando V1 SessionsShell + ChatDisplay vs V2 sessão atual: zero faixas chrome entre top bar e transcript.
- **Search regression:** `grep -rn "SessionHeader[^a-z]"` no código de produção retorna apenas referências legacy em comentários/JSDoc.
- **UX validation:** próximo CR (pós-canary) deve confirmar que rename via panel não gerou tickets de "como renomeio uma sessão".
- **Métrica negativa:** se >5 features novas tentarem adicionar bar de chrome no chat, revisar e considerar ADR superseder.

## Referencias

- Audit V1↔V2: [`Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md`](../../../Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md)
- ADR-0111: Chat composer architecture (composer slots — local canônico de pickers).
- ADR-0140: Composer slots SourcePicker + MentionPicker + WorkingDirPicker.
- V1 reference: `apps/electron/src/renderer/components/app-shell/SessionsShellTopBar.tsx` + `ChatDisplay.tsx` (sem session-header dedicada).

---

## Histórico de alterações

- 2026-05-01: Proposta e aceita no mesmo dia (decisão direta após audit V1↔V2; consenso sobre paridade visual; refactor low-blast-radius).
