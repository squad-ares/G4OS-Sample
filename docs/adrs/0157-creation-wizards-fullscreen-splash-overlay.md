# ADR 0157: Creation wizards renderizados como fullscreen splash overlay

## Metadata

- **Numero:** 0157
- **Status:** Accepted
- **Data:** 2026-05-01
- **Autor(es):** @igor.rezende
- **Stakeholders:** @tech-lead, @ux

## Contexto

ADR-0150 define a heurística "modal vs page" e classificou **workspace creation = page** (deep link viável, side effects pesados, wizard multi-step). Mas não especificou o **tratamento visual** dessa página. A V2 (até 2026-04-30) renderizava `WorkspaceSetupWizard` como card inline dentro do shell `_app`:

- Card `rounded-3xl border bg-background/80` no centro do viewport.
- Sub-sidebar (workspace list) ainda visível à esquerda.
- Top bar do shell com nav tabs ainda visível.
- Sem drag region dedicada.
- Sem brand background.

V1 trata o mesmo fluxo de forma fundamentalmente diferente — via `WorkspaceCreationScreen.tsx` ([apps/electron/src/renderer/components/workspace/](../../../G4OS/apps/electron/src/renderer/components/workspace/)):

- `FullscreenOverlayBase` com `z-splash` — escapa toda a chrome do shell.
- `brand-dotted-bg` absoluto cobrindo o viewport.
- `motion.div` com `overlayTransitionIn` (fade-in 200ms).
- Header próprio com `titlebar-drag-region h-[50px]` + close button explícito (`titlebar-no-drag`).
- 2-step Obsidian-style: Choice (Create new vs Open folder) → form.

A audit V1↔V2 ([`Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md`](../../../Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md), 2026-05-01) classificou a divergência como **P1 — regressão de presença**: o card inline reduz a importância visual do ato de criar workspace, perde o brand pattern, e não tem a "respiração" de um fluxo dedicado.

ADR-0150 já decidiu *o que* (page); este ADR decide *como renderizar* essa page.

## Opções consideradas

### Opção A: Manter card inline dentro do shell

**Descrição:** acatar o estado atual; assumir que workspace creation é "mais uma rota" e não merece tratamento especial.

**Pros:**
- Sem refactor.
- Consistência simplista — toda rota é renderizada igual dentro do shell.

**Contras:**
- Divergência explícita com V1 (regressão de UX percebida).
- Sub-sidebar de workspace visível enquanto cria novo workspace = visual ruidoso, contexto poluído.
- Top bar com nav tabs continua clicável — usuário pode acidentalmente sair do wizard sem confirmação.
- Perde o brand pattern (`brand-dotted-bg`) que reforça identidade do produto.
- Não tem drag region dedicada — em macOS, arrastar a janela durante o wizard fica pior.

### Opção B: Mover rota pra fora de `_app/`

**Descrição:** criar `routes/workspaces.new.tsx` no nível root (fora do `_app` layout), perdendo o wrapping automático.

**Pros:**
- Ausência total da chrome do shell — sem sub-sidebar, sem top bar.

**Contras:**
- Perde o auth guard que vive no `_app` layout (precisa duplicar a lógica).
- TanStack Router deep-link pra `/workspaces/new` precisaria de re-validação de auth manualmente.
- Difícil voltar para "dentro" do shell após cancelar — navegação ressincroniza estado de autenticação.
- Refactor maior de roteamento sem ganho proporcional.

### Opção C: Manter rota em `_app/` mas renderizar com `fixed inset-0 z-[100]` (overlay sobre shell)

**Descrição:** o componente da rota envolve o wizard em um wrapper `fixed inset-0 z-[100]` com `brand-dotted-bg` + drag region + close button (X). O shell layout continua montado por trás (auth guard preservado), mas o overlay cobre 100% do viewport.

**Pros:**
- Preserva auth guard do `_app` sem duplicação.
- Visual idêntico ao splash da V1 — `brand-dotted-bg`, drag region, close button.
- Z-index 100 garante que sub-sidebar / top bar não vazam.
- Navegar pra fora (close X) é determinístico — `navigate({ to: '/workspaces' })` volta pro shell normal.
- Refactor mínimo — só o componente da rota muda; wizard interno (`WorkspaceSetupWizard`) intocado.

**Contras:**
- Tecnicamente o shell ainda está montado (custo de render baixo, mas não-zero).
- Z-index 100 é mágico — precisa documentar que esse é o único caso permitido de `z-[100]`.

## Decisão

Optamos pela **Opção C — Wrapper fullscreen overlay dentro de `_app/`**.

### Aplicação canônica

Toda rota classificada como **page** por ADR-0150 que é wizard / creation flow renderiza no shape:

```tsx
// routes/_app/<entity>.new.tsx
return (
  <div className="fixed inset-0 z-[100] flex flex-col bg-background">
    <div
      aria-hidden={true}
      className="brand-dotted-bg pointer-events-none absolute inset-0 opacity-90"
    />
    <header className="titlebar-drag-region relative flex h-[50px] shrink-0 items-center justify-end px-6">
      <button
        type="button"
        onClick={close}
        disabled={submitting}
        aria-label={t('<entity>.wizard.close')}
        className="titlebar-no-drag mt-2 flex size-8 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent/12 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="size-4" aria-hidden={true} />
      </button>
    </header>
    <main className="relative flex flex-1 items-center justify-center p-8">
      <{Wizard} ... />
    </main>
  </div>
);
```

Aplicado em:
- `routes/_app/workspaces.new.tsx` (TASK CR1 wave 2 — entrega original deste ADR).
- `routes/_app/onboarding.tsx` (já tinha card inline; deve seguir o mesmo pattern em refactor pós-canary — ver "Tarefas decorrentes").

### Regra forward-looking

Quando ADR-0150 classifica uma rota como **page** AND a rota é creation/wizard:

- Renderizar em fullscreen overlay (`fixed inset-0 z-[100]`).
- Aplicar `brand-dotted-bg` no background.
- Reservar `h-[50px]` no topo como `titlebar-drag-region` com close button `titlebar-no-drag` no canto direito.
- `disabled={submitting}` no close button — wizards em estado de submit não devem ser fecháveis.

Para pages que **não** são creation/wizard (ex.: settings, projects list), continuar renderizando dentro do shell normal.

### Z-index policy

`z-[100]` é reservado para **fullscreen creation/wizard overlays**. Toasts e modais regulares continuam usando o sistema padrão (`@g4os/ui` `Dialog` z-index). Permission modal e debug-hud têm seus próprios z-indexes documentados em ADR-0116 e ADR-0146 respectivamente.

## Consequências

### Positivas

- Paridade visual restaurada com V1 splash — usuários retornantes reconhecem o pattern.
- Brand presence forte no momento crítico de criar a entidade primária do produto.
- Auth guard preservado (não duplicado) — `_app` layout continua autoritativo.
- Sub-sidebar / top bar não competem visualmente no momento da criação.

### Negativas / Trade-offs

- Z-index 100 é mágico mas necessário — overlay precisa cobrir `Dialog` regular caso aberto antes do navigate.
- Shell layout ainda monta por trás do overlay (custo render desprezível, mas não-zero — render custa ~3-5ms em produção).
- Cada wizard precisa de sua própria translation key `<entity>.wizard.close` (já existem `workspace.wizard.close` em ambas locales).

### Neutras

- O componente interno do wizard (`WorkspaceSetupWizard`, `OnboardingWizard`) não muda — só o wrapping da rota.
- Adição de ~30 LOC por rota; aceitável, não toca cap de file-lines.

## Validação

- **Visual:** abrir `/workspaces/new` e confirmar que sub-sidebar de workspaces some, top bar some, brand-dotted-bg está visível no fundo, drag region funciona em macOS (arrastar pelo header move janela).
- **Auth regression test:** logout → tentar abrir `/workspaces/new` → deve redirecionar pra login (auth guard do `_app` ainda gata).
- **Submit-busy test:** começar criação → confirmar que close X fica disabled durante `submitting=true`.
- **E2E smoke:** `apps/desktop-e2e/` pode adicionar smoke "workspace create canvas overlays shell" comparando `screenshot()` em estado de wizard vs shell normal.

## Tarefas decorrentes

- [ ] Aplicar mesmo pattern em `routes/_app/onboarding.tsx` (atualmente card inline). Pós-canary, opcional para v0.
- [ ] Documentar `z-[100]` reservado em `packages/ui/src/globals.css` como comentário ou util class.
- [ ] Considerar extrair `<CreationOverlayShell />` em `@g4os/ui` se uma 3ª rota seguir o mesmo pattern (DRY após N=3, não antes).

## Referencias

- Audit V1↔V2: [`Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md`](../../../Docs/STUDY/code-review/v1-v2-divergence-shell-onboarding.md) (Wave 2, P1).
- ADR-0150: Modal vs Page para fluxos de criação (decide *o que*; este ADR decide *como*).
- ADR-0116: Permission modal — referência de z-index policy.
- V1 reference: `apps/electron/src/renderer/components/workspace/WorkspaceCreationScreen.tsx`.
- Tailwind utility `brand-dotted-bg`: `packages/ui/src/globals.css:340`.

---

## Histórico de alterações

- 2026-05-01: Proposta e aceita no mesmo dia (decisão clara, escopo restrito a creation flows, refactor de baixo risco).
