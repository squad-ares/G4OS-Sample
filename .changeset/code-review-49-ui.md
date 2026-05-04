---
'@g4os/ui': patch
---

Code Review 49 — packages/ui — auditoria exaustiva da base visual.

22 findings (3 MAJOR, 7 MEDIUM, 9 LOW, 3 INFO). UI é base de visual — bugs aqui cascateiam para todo o app. Severidade aferida considerando que `packages/ui/src/` é root monitorado tanto pelo gate `check:i18n-strings` quanto pelo `check:hover-pattern`, e os componentes são consumidos por features + renderer + (futuro) viewer.

## MAJOR

**F-CR49-1 — Strings hardcoded `Copy`/`Copied` em CodeBlock (MAJOR — viola ADR-0109)**.
File: `packages/ui/src/markdown/code-block.tsx:59`. Botão de copy em todo bloco de código exibe literais ingleses fixos: `{copied ? 'Copied' : 'Copy'}`. ADR-0109 exige que toda string visível em `packages/ui/src` passe pelo translate. Escapou o gate `check:i18n-strings` porque o script só inspeciona `JsxText` + 4 atributos (`aria-label`, `placeholder`, `title`, `alt`); strings dentro de expressões JSX `{cond ? 'X' : 'Y'}` não são detectadas — mesmo gap permite outros vazamentos.
**Fix:** adicionar `markdown.code.copy` / `markdown.code.copied` em pt-br.ts + en-us.ts; injetar `useTranslate()` no CodeBlock (já tem hooks porque usa shiki). Reforçar gate: estender `check-i18n-strings.ts` para também inspecionar `StringLiteral` em `JsxExpression` quando ancestral é JSXElement com role visível (ou pelo menos warn).

**F-CR49-2 — Tooltip usa z-50 raw quebrando hierarquia z-index (MAJOR — viola ADR-0108)**.
File: `packages/ui/src/components/tooltip.tsx:22`. Tooltip aplica `z-50` literal enquanto Dialog usa `z-modal` (50), Drawer `z-modal` (50), Popover `z-dropdown` (40), Select `z-floating-menu` (35), DropdownMenu `z-dropdown` (40). Tooltip empata com Dialog (ambos z=50) — tooltip aberto sobre dialog NÃO sobrepõe corretamente, e se a hierarquia mudar (`--z-modal: 60`) o tooltip fica abaixo. ADR-0108 exige tokenização do core visual; valor literal quebra o contrato.
**Fix:** trocar `z-50` por `z-floating-menu` (tooltip é o overlay mais leve, deveria ficar acima de dropdown mas atrás de modal — recomendo adicionar `--z-tooltip: 55` em `globals.css` e usar `z-tooltip` aqui). Re-validar empilhamento: tooltip > modal (precisa aparecer sobre confirm dialog, p.ex.) ou tooltip < modal (decidir e documentar em ADR).

**F-CR49-3 — `useDisposable` com bug de closure + race em StrictMode (MAJOR — viola ADR-0012)**.
File: `packages/ui/src/hooks/use-disposable.ts:11-19`. Três defeitos compostos:
(a) o cleanup do `useEffect` faz `storeRef.current = null` — em React StrictMode (roda mount/unmount/mount em dev), o segundo mount encontra `storeRef.current === null` mas o `if (!storeRef.current)` só roda no body inicial, então `storeRef.current` permanece null e os disposables registrados depois do remount caem em no-op silencioso (`storeRef.current?.add(d)`);
(b) a função retornada não é envolvida em `useCallback` — toda re-render produz nova referência, qualquer `useEffect(() => register(d), [register])` no consumer dispara em loop;
(c) zero proteção contra `add` em store já disposed — o consumer pode tentar registrar após unmount (callback async resolvendo) e ele vai pra um store dead que nunca executa dispose. Antipattern claro: o ADR-0012 mostra explicitamente `add` lançando se disposed.
**Fix:** remover `storeRef.current = null` no cleanup (deixar GC cuidar); envolver retorno em `useCallback(...,[])`; opcionalmente expor `disposed` flag e no-op explícito (com `console.warn` em dev) quando registrar pós-dispose.

## MEDIUM

**F-CR49-4 — `focus:bg-foreground/5` em DropdownMenu/ContextMenu/Select/Command/Switch quebra contraste em dark mode (MEDIUM — espelha ADR-0154)**.
Files: `packages/ui/src/components/dropdown-menu.tsx:71,89,120,194` (4 ocorrências); `context-menu.tsx:74,93,153,203,224,249` (6 ocorrências); `command.tsx:111`; `select.tsx:118`; `switch.tsx:13` (`data-[state=unchecked]:bg-foreground/15`). ADR-0154 documenta que `bg-foreground/N` baixo em dark mode (`foreground` branco com 5% sobre fundo escuro = cinza claro de baixo contraste). O gate `check:hover-pattern` cobre só `hover:` — `focus:`/`data-[state=...]` escapam. Item de dropdown/menu focado via teclado fica visualmente quase invisível em dark.
**Fix:** trocar para `focus:bg-accent/12` ou `focus:bg-accent/15` (padrão aprovado). Ampliar o gate `check:hover-pattern` para também cobrir `focus:bg-foreground/N` e `data-[state=*]:bg-foreground/N` com a mesma whitelist (90/95/100). Reforça princípio "forcing functions > prosa".

**F-CR49-5 — Avatar.CrossfadeAvatar: `new Image()` sem cleanup vaza handle (MEDIUM — viola ADR-0012)**.
File: `packages/ui/src/components/avatar.tsx:71-86`. O `useEffect` cria `const img = new Image()` para detectar cache hit, mas não nulifica `img.src` no cleanup. Se `src` mudar antes do load resolver, o browser ainda mantém request in-flight referenciada pelo objeto (que vai pra GC, mas só depois do load completar). Em listas longas com avatares trocando de src (chat com 100+ messages), acumula network handles. Adicionalmente o effect depende de `currentSrc`, criando re-execução sempre que o `setCurrentSrc` é chamado dentro do próprio effect.
**Fix:** usar AbortController via `fetch` ou guardar `img` em ref e setar `img.src = ''` no cleanup; remover `currentSrc` das deps usando ref interna pra última src vista. Considerar trocar a heurística de cache check por `loading="eager"` no `<img>` real (browser já faz cache).

**F-CR49-6 — `aria-label="undefined"` ainda pode aparecer em CrossfadeAvatar SVG branch (MEDIUM — viola ADR-0110)**.
File: `packages/ui/src/components/avatar.tsx:126`. O comentário diz que omite `aria-label` quando `alt === undefined`, mas o spread `{...rest}` também não chega aqui — só o branch SVG tem o guard. Para imagens raster (linha 137-149) o `<img alt={alt}>` resulta em `alt=""` se `alt === undefined` (browser-OK). Mas se `alt === ''` propositalmente passado pelo caller (decorative), o role="img" do SVG branch ainda vai expor o div — falta `aria-hidden="true"` no caso decorative. Inconsistência entre branches SVG vs raster: SVG sempre `role="img"` mesmo quando decorative.
**Fix:** se `alt === ''`, marcar SVG branch como `role="presentation"` + `aria-hidden="true"`. Documentar contrato: `alt: undefined` = fallback inacessível, `alt: ''` = decorative, `alt: 'string'` = label.

**F-CR49-7 — `G4OSSymbol` sempre `role="presentation"` ignora props para uso semântico (MEDIUM — viola ADR-0110)**.
File: `packages/ui/src/components/g4os-symbol.tsx:22`. `role="presentation"` é fixo no JSX, e `{...rest}` não tem `role` no tipo (omit-list só `'children'|'viewBox'|'fill'`). Consumer querendo uso semântico (logo de boot screen, marca em workspace landing) não consegue passar `role="img" + aria-label`. Em `apps/desktop/src/renderer/routes/_app/workspaces.$workspaceId.index.tsx:97` o símbolo é o brand mark da landing — deveria ser anunciado por screen reader. Adicionalmente, `role="presentation"` + `aria-hidden="true"` é redundância (presentation já remove do AT tree).
**Fix:** remover `role="presentation"` hardcoded; deixar default `aria-hidden="true"` (decorative) mas permitir override completo via props (incluir `role` e `aria-label` no tipo).

**F-CR49-8 — `ButtonProps.asChild` não-readonly contraria padrão dos demais componentes (MEDIUM — viola ADR-0002)**.
File: `packages/ui/src/components/button.tsx:43`. `asChild?: boolean;` (não readonly), enquanto outros wrappers Radix usam `Readonly<ComponentProps<...>>` ou expõem readonly props. Inconsistência. Não bloqueante para typecheck mas degrada padrão. ADR-0002 exige strict tipo + consistência.
**Fix:** marcar `readonly asChild`. Auditar resto: avatar (`Readonly<...>`), ContextMenu (`Readonly<...>`), DropdownMenu (`Readonly<...>`), Dialog (não tem). Padronizar.

**F-CR49-9 — `tsup.config.ts` só emite `src/index.ts` mas package.json declara 6 exports (MEDIUM — desperdício de CI)**.
File: `packages/ui/tsup.config.ts`. Entry list: `entry: ['src/index.ts']`. Mas package.json declara subpaths `./theme`, `./platform`, `./form`, `./markdown`. Como exports apontam diretamente para `./src/...ts` (não para `./dist/...`), o build do tsup é cosmético — gera só `dist/index.{js,cjs}` que nada consome (consumidores via Vite veem o source TS). Resultado: build CI gasta tempo gerando artefato morto, e em caso de bump para artefato real (pre-publish, viewer web) os subpaths quebrariam.
**Fix:** decidir o modelo: (a) source-only (remover scripts/build, alinhar com `@g4os/translate` se for o caso) ou (b) builds completos — adicionar entries `theme/index.ts`, `platform/index.ts`, `form/index.ts`, `markdown/index.ts` no tsup E mudar exports para apontar `./dist/{slug}/index.js`. Consistência com decisão monorepo.

**F-CR49-10 — Falta de qualquer teste em `packages/ui` (MEDIUM — viola princípio "forcing functions" do CLAUDE.md)**.
Não há `__tests__/` em `packages/ui`. UI é base shared com 46 arquivos consumidos por features + renderer. ADR-0103 contrato de validação prevê "Button, Input, Dialog, Spinner, Tooltip funcionais com dark mode" — sem testes não há gate. Componentes derivados (CrossfadeAvatar, OtpField, AnimatedCollapsibleContent, ConfirmDestructiveDialog) têm lógica não-trivial (paste handler, cache de Image, spring animation, focus mgmt) e zero cobertura.
**Fix:** adicionar `vitest` smoke tests para os helpers (`cn` em `libs/utils.ts`, `useDisposable`, `LruCache` em `use-highlighted-html.ts`, `onlyDigits` em `otp-field.tsx`) e snapshot/render tests para os components compostos críticos (Dialog, ConfirmDestructiveDialog, OtpField paste handler, CrossfadeAvatar src change). Setup `@testing-library/react` (já em features/).

## LOW

**F-CR49-11 — TextareaField effect com `void field.value` é code smell (LOW)**.
File: `packages/ui/src/form/textarea-field.tsx:86`. Comentário admite que `void field.value` é workaround pra o Biome considerar a dependência exhaustiva. Padrão é fragil — qualquer refactor pode tornar a expressão "morta" e dropar a dep. Melhor extrair `const value = field.value` e usar `value` no array de deps.
**Fix:** `const value = field.value;` no topo, deps `[value, minRows, maxRows]`.

**F-CR49-12 — `setRef` callback no TextareaField não respeita `field.ref` mutability (LOW)**.
File: `packages/ui/src/form/textarea-field.tsx:75-81`. `useCallback(setRef, [field.ref])` — react-hook-form `field.ref` é estável dentro de um render mas pode trocar entre renders quando o controller resolve novamente. Resultado: ref re-callback dispara dois fluxos de mount/unmount no mesmo elemento. Padrão idiomático é `useCallback(..., [])` e chamar `field.ref(el)` direto — RHF aceita.
**Fix:** `useCallback(..., [])`.

**F-CR49-13 — TranslateProvider fallback degrada UX silenciosamente em produção (LOW — viola ADR-0109)**.
File: `packages/ui/src/translate/translate-provider.tsx:75-87`. Quando `useTranslate()` é chamado fora de provider, retorna fallback que ecoa a chave (`t('shell.title')` → `'shell.title'`). Comentário diz "só ergonomia/dev-mode" mas não há guard `process.env.NODE_ENV` — em produção também eco de chave. Em produção isso é grave: usuário vê `shell.title` em vez de "G4 OS". ADR-0109 quer i18n por contrato; fallback silencioso vira dívida invisível.
**Fix:** em dev (NODE_ENV !== 'production'), `console.warn('useTranslate called without provider — falling back to key echo')` na primeira chamada por componente. Em prod, idealmente `throw` (ou pelo menos logar via observability).

**F-CR49-14 — Dialog/DialogPortal/DialogTrigger sem `displayName` (LOW)**.
File: `packages/ui/src/components/dialog.tsx:8-22`. `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` são function components sem displayName. React DevTools mostra "_default" ou nome genérico. ADR-0103 não exige mas é boa prática shadcn — facilita debugging.
**Fix:** adicionar `Dialog.displayName = 'Dialog'`, etc., em todos os subcomponentes function. (Mesmo gap em Drawer, Popover, Select, ContextMenu, DropdownMenu, Switch, Separator, Avatar, Spinner, Label).

**F-CR49-15 — DialogContent close button: `data-[state=open]:bg-foreground/5` viola padrão de gate quando estendermos (LOW — antecipa F-CR49-4)**.
File: `packages/ui/src/components/dialog.tsx:69`. `data-[state=open]:bg-foreground/5` — mesmo problema de contraste em dark mode descrito em F-CR49-4.
**Fix:** mesmo fix (trocar para `accent/12`); incluir no gate ampliado.

**F-CR49-16 — `Toaster` re-export sem variantes traduzidas (LOW — viola ADR-0109)**.
File: `packages/ui/src/components/toast.tsx:1`. Re-exporta sonner direto. Toda chamada `toast.error('...')` em features passa string raw — sem hook de translate. ADR-0109 caminhos monitorados incluem `packages/features/src` então o gate pega lá, mas o `toast` re-exportado em UI deveria oferecer wrapper que aceite `TranslationKey`.
**Fix:** opcional. Adicionar `useTranslatedToast()` em `@g4os/ui` que recebe `TranslationKey` e chama `t(key)` antes de delegar. Reduz o boilerplate em consumer.

**F-CR49-17 — `setTimeout` em CodeBlock sem cleanup (LOW — viola ADR-0012)**.
File: `packages/ui/src/markdown/code-block.tsx:30`. `setTimeout(() => setCopied(false), 1500)` — se o componente desmontar nesse intervalo (mensagem deletada do chat, retry de turn), `setCopied` em componente unmounted dispara warning React. Padrão `IDisposable`/cleanup não respeitado.
**Fix:** mover para useEffect com cleanup OR guardar timeout id em ref e clear no unmount.

**F-CR49-18 — MermaidBlock + PdfPreview: `effect` sem cancelar load promise (LOW — viola ADR-0012)**.
Files: `packages/ui/src/markdown/mermaid-block.tsx:92-118`, `packages/ui/src/markdown/pdf-preview.tsx:85-93`. Usam flag `let cancelled = false` mas o `loadMermaid()`/`loadReactPdf()` Promise singleton continua resolvendo — só ignora resultado. OK em prática, mas se o render side-effect (`mermaidLib.initialize`) tiver ponteiro pra módulo ainda em loading, e o componente desmontar antes do `lib.render`, o `containerRef.current?.innerHTML` é guard mas o `lib.render(id, code)` ainda roda (custo) e em test environment causa unhandled rejection.
**Fix:** ok como está pro MVP; documentar limitação.

**F-CR49-19 — `cn` sem teste e sem doc de edge cases (LOW)**.
File: `packages/ui/src/libs/utils.ts`. Helper crítico (chamado em todos os components). Comportamento de `twMerge` diverge entre versões e pode quebrar override patterns. Sem teste de regressão.
**Fix:** adicionar testes com casos óbvios (`cn('px-2','px-4')`, `cn('text-red-500', cond && 'text-blue-500')`, conflict resolution `cn('hover:bg-accent/15','hover:bg-accent/20')`).

## INFO

**F-CR49-20 — README + AGENTS.md desatualizados (INFO)**.
File: `packages/ui/README.md` lista 4 ADRs mas não documenta o gate `check:hover-pattern` (ADR-0154) nem a exigência de `useTranslate()` (ADR-0109). Não há AGENTS.md em `packages/ui` — CLAUDE.md raiz exige sincronização (per-package opcional, mas ui é estrutural o bastante para merecer um par próprio com convenções de hover/focus/i18n/displayName).
**Fix:** adicionar AGENTS.md espelhando README + seção "Padrões obrigatórios" com hover/focus tokens, todo string deve passar por translate, displayName em todos os components.

**F-CR49-21 — `displayName` style misto (INFO — INFO porque cosmético)**.
Mistura: `Button.displayName = 'Button'` (literal), `TooltipContent.displayName = TooltipPrimitive.Content.displayName` (delegado), `DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'` (literal). Padronizar — recomendo literal para clareza no React DevTools (delegação resolve para nome interno do Radix tipo `'Tooltip.Content'`).

**F-CR49-22 — Catalog drift potencial (INFO — ADR-0153)**.
File: `packages/ui/package.json`. Algumas deps não usam `catalog:` quando deveriam: `class-variance-authority` (^0.7.1), `tailwind-merge` (^3.3.1), `cmdk` (^1.1.1), `motion` (^12.12.1), `vaul` (^1.1.2), `sonner` (^2.0.3), `@radix-ui/*` (todos com versão literal). Estes pacotes são usados só em `packages/ui` — o critério ADR-0153 é "2+ packages" — então tecnicamente OK. Porém quando `apps/viewer` (web) eventualmente importar de `@g4os/ui` ou `packages/features` precisar de `cva`/`tw-merge`, vão criar segunda cópia com drift. Considerar promover ao catalog preventivamente.

---

## Resumo

- 22 findings: 3 MAJOR + 7 MEDIUM + 9 LOW + 3 INFO
- Áreas cobertas: i18n (ADR-0109), hover/focus (ADR-0154), theme (ADR-0102), Radix/shadcn (ADR-0103), visual parity (ADR-0108), a11y (ADR-0110), Disposable (ADR-0012), TS strict (ADR-0002), catalog (ADR-0153), tests, build config, boundaries, z-index hierarchy.
- Gates ampliáveis: `check:i18n-strings` para JsxExpression strings; `check:hover-pattern` para `focus:` + `data-[state=*]:` patterns.
- Boundaries OK: ui só importa `@g4os/kernel/disposable` + `@g4os/translate` (ADR-0103 + ADR-0006 respeitados).
- Typecheck: 0 erros (`pnpm typecheck --filter @g4os/ui` passa).
