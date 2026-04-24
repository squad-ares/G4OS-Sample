# ADR 0139: Settings hub — 12-category catalog + route switch + feature package

## Metadata

- **Numero:** 0139
- **Status:** Accepted
- **Data:** 2026-04-24
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead
- **Task relacionada:** TASK-OUTLIER-16 (settings hub)

## Contexto

V1 settings eram espalhados em múltiplos modals/drawers sem hierarquia clara. V2 precisava de uma página `/settings` com:

1. Catálogo enumerado (12 categorias cobrindo workspace, app, agents, appearance, input, usage, permissions, tags, cloud-sync, repair, shortcuts, preferences).
2. Route `/settings/$category` — cada categoria é uma tela navegável individualmente.
3. Integração profunda com packages existentes: cada categoria tem sub-componentes em `@g4os/features/settings/components/`.
4. Observabilidade: permissions category precisa listar tool decisions do `PermissionStore` + oferecer revoke.

## Opções consideradas

### Opção A: Modal stacking (como V1)
**Contras:** UX ruim, não é deep-linkable, não escala pra 12 categorias.

### Opção B: Single page com tabs
**Contras:** 12 tabs é demais. Usuário não acha a categoria certa.

### Opção C: Dedicated route per category + sub-sidebar nav (aceita)
**Descrição:**
- `packages/features/src/settings/categories.ts` — fonte de verdade do catálogo: 12 IDs (`app`, `agents`, `appearance`, `input`, `workspace`, `usage`, `permissions`, `tags`, `cloud-sync`, `repair`, `shortcuts`, `preferences`) + label via i18n key.
- `packages/features/src/settings/components/*-category.tsx` — um componente per categoria. Cada categoria é independente (pode usar forms próprios, seu state, suas mutations tRPC).
- `apps/desktop/src/renderer/routes/_app/settings.$category.tsx` — switch que resolve o componente baseado no `category` param. 12 branches.
- `apps/desktop/src/renderer/settings/category-containers.tsx` — wrappers que conectam feature components com trpc (queries específicas por categoria).
- `SubSidebarShell` (de `@g4os/features/shell`) lista as categorias no painel lateral do `/settings`.

## Decisão

**Opção C.** Catalog-driven + route-per-category. Placeholders honestos onde apropriado:

- `UsageCategory` — placeholder com stats `—` + badge "Em breve" até billing backend existir.
- `CloudSyncCategory` — descritivo do escopo (o que sincroniza vs não) + badges "Em breve". Não fake-funciona.
- `PermissionsCategory` — DUAS seções: (a) "Tool decisions" listando cada `(toolName, argsHash)` persistido com preview de args + botão Revoke via `trpc.permissions.revoke`; (b) "Sources per-session" listando sticky/rejected slugs com Clear via `sessions.update`.

## Consequências

### Positivas
- Cada categoria é um entry point isolado — deep links `/settings/permissions` funcionam.
- Feature package é consumível por outras superfícies (ex: um "quick settings" flutuante).
- 40+ translation keys por categoria organizadas hierarquicamente (`settings.workspace.name`, etc.) — i18n pt-BR + en-US em parity.
- Placeholders honestos ao invés de fake features — usuário sabe o que está em beta vs pronto.

### Negativas / Trade-offs
- Switch de 12 cases em `settings.$category.tsx` é verboso. Alternativa (mapa literal component→key) funcionaria mas obscurece. Switch é mais legível pra este tamanho fixo.
- Duplicação de scaffold (cada categoria tem header, title, intro). Mitigado: `InputCategory` e `ShortcutsCategory` são inline no route file porque são listas simples — menos LOC total.

### Neutras
- Tags category migrada pra `react-hook-form` + `zodResolver` + `InputField` (parity com auth steps, ADR existente).

## Validação

- `/settings` renderiza sub-sidebar com 12 links.
- Cada link abre a categoria certa.
- PermissionsCategory lista decisions persistidas; revoke funciona end-to-end (Store → IPC → UI refresh).
- i18n parity verificada: mesmo conjunto de keys em en-us.ts e pt-br.ts.

## Referencias

- TASK-OUTLIER-16 em `STUDY/Outlier/`

---

## Histórico de alterações

- 2026-04-24: Proposta e aceita.
