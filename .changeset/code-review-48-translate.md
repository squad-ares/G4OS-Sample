---
'@g4os/translate': patch
'@g4os/desktop': patch
'@g4os/ui': patch
---

Code Review 48 — packages/translate — 11 findings (3 MAJOR, 5 MEDIUM, 3 LOW).

Translate é base do ADR-0109 (no hardcoded UI strings). Cobertura: API, locale resolution, storage, interpolação, plurais, pluggability, bundling, boundaries, tests, type generation, lint integration, paridade pt-BR/en-US, drift de catálogo, paridade V1.

Áreas cobertas: `src/translate.ts` (interpolação + locale resolution + formatters), `src/messages.ts` (registry de dicionários), `src/types.ts`, `src/locales/{pt-br,en-us}.ts` (1336 chaves cada), `src/__tests__/translate.test.ts`, `package.json`, `tsup.config.ts`, integração com `packages/ui/src/translate/translate-provider.tsx`, `scripts/check-i18n-strings.ts`, gates CI (`.github/workflows/ci.yml`), boundaries em `.dependency-cruiser.cjs`.

---

## F-CR48-1 (MAJOR) — `debugHud.*` usa single-brace `{x}`, não double-brace `{{x}}` — interpolação quebrada

**Arquivo:** `packages/translate/src/locales/en-us.ts:1305-1587` e `packages/translate/src/locales/pt-br.ts` (mesmas linhas).
**Root cause:** o regex em `translate.ts:39` é `/\{\{([a-zA-Z_$][a-zA-Z0-9_$.]*)\}\}/gu` — só casa double-braces. Mas a partir da chave `debugHud.header.alertsOne` (linha 1305) os templates usam `{count}`, `{ok}`, `{failed}`, `{action}`, `{growth}`, `{rss}`, `{total}`, `{pct}`, `{rate}`, `{p95}`, `{value}`, `{duration}`, `{turnId}`, `{stale}`, `{seen}`, `{max}`, `{path}`, `{label}`, `{sessionId}` — single-brace. Ao chamar `t('debugHud.header.alertsOne', { count: 3 })` o usuário vê **literalmente** `{count} alert` (e em pt-BR `{count} alerta`), porque o regex não casa e o token nunca é substituído. O `apps/desktop/src/renderer/debug-hud/app.tsx:550` chama `t("debugHud.header.alertsOne", { count: insights.length })` confirmando o consumo.
**Evidência adicional:** o teste `placeholder tokens match between locales for keys with {{token}}` em `__tests__/translate.test.ts:18` usa o mesmo regex de double-brace e por isso **não detecta** o drift entre `{count}` (template) e `count` (param) — passou silenciosamente em todos os PRs.
**Quantidade:** 35 chaves `debugHud.*` afetadas (`grep -cE "\{[a-z]+\}[^}]" en-us.ts` retorna 35).
**Fix:** decidir um padrão único e aplicar em todo o catálogo:
- (a) substituir as 35 ocorrências `{token}` → `{{token}}` em ambos os locales (consistente com o resto do app), ou
- (b) ampliar o regex para `/\{\{?([a-zA-Z_$][a-zA-Z0-9_$.]*)\}?\}/gu` (mais permissivo, mas perde sinal de erro quando dev escreve `{}` por engano).
Recomenda-se (a) + adicionar teste que falha quando um template contém `\{[a-z]+\}` sem brace duplo. ADR-0109 garante a política mas não verifica o formato dos templates.
**ADR:** 0109 (zero hardcoded strings → mas a substituição precisa funcionar para "string traduzida" virar "string com valor").

## F-CR48-2 (MAJOR) — `check:i18n` não está conectado ao CI nem ao lefthook

**Arquivo:** `.github/workflows/ci.yml`, `lefthook.yml`, `package.json:11` declara `"check:i18n": "tsx scripts/check-i18n-strings.ts"`.
**Root cause:** ADR-0109 explicitamente diz que "scripts/check-i18n-strings.ts passa a bloquear JSX text e atributos visíveis (...) em apps/desktop/src/renderer, packages/features/src, packages/ui/src". O script existe e funciona, mas **não está rodando como gate** — nenhuma referência a `check:i18n` no `ci.yml` (que tem `check:file-lines`, `check:main-size`, `check:circular`, `check:cruiser`, `check:dead-code`, `check:unused-deps`, `check:exports`) nem no `lefthook.yml`. Em `CLAUDE.md` o script aparece na lista de scripts mas falta na lista da seção "quality gates (rodam em CI nesta ordem)". Resultado: regressão silenciosa — qualquer PR pode introduzir hardcoded JSX text e merge sem alertar.
**Fix:** adicionar step "Check i18n hardcoded strings — run: pnpm check:i18n" no job `arch-gates` do `ci.yml`. Adicionar entry no `lefthook.yml` (`pre-commit`/`pre-push`) para shift-left. Confirmar que `pnpm check:i18n` em estado clean retorna exit 0; ajustar allowlist se necessário.
**ADR:** 0109 (forcing function vs sugestão informal — princípio 1 do CLAUDE.md "Forcing functions > prosa").

## F-CR48-3 (MAJOR) — `useTranslate` fallback retorna `String(key)` (chave crua) em vez de buscar no `dictionaries`

**Arquivo:** `packages/ui/src/translate/translate-provider.tsx:79-86`.
**Root cause:** quando o componente é renderizado **fora** do `<TranslateProvider>` (Suspense boundary, hot reload, dev-mode lazy chunk), `useTranslate()` retorna um fallback degradado onde `t(key) = String(key)`. Isso significa que `t('app.name')` renderiza literalmente "app.name" na tela, não "G4 OS". O comentário admite "Chaves cruas na UI sinalizam o problema ao dev" — mas em produção, end-users veem chaves técnicas. Como o package `@g4os/translate` já exporta `dictionaries` e `DEFAULT_LOCALE`, o fallback poderia simplesmente fazer `dictionaries[DEFAULT_LOCALE][key] ?? String(key)` — mantém UX honesto sem provider e ainda sinaliza falta de provider via DEFAULT_LOCALE forçado.
**Fix:** importar `dictionaries` + `DEFAULT_LOCALE` + `translate` no fallback e retornar `translate('pt-BR', key, params)`. Ou, mais conservador: emitir `console.warn` em dev e usar dictionary lookup mesmo sem provider. Bundle cost zero — o módulo já é importado.
**ADR:** 0109 (i18n-ready por contrato, não por disciplina).

## F-CR48-4 (MEDIUM) — `setLocale` não sincroniza entre janelas/contexts; storage key não é namespaced por user

**Arquivo:** `packages/translate/src/translate.ts:4` (`LOCALE_STORAGE_KEY = 'g4os.locale'`), `26` (`persistLocale`), `19` (`resolveInitialLocale`).
**Root cause:** o locale é persistido em `localStorage` com chave global. Em multi-window (vários `BrowserWindow` Electron), trocar locale numa janela **não** sincroniza com as outras — só na próxima inicialização (e nem isso, se a outra janela já carregou o provider). Não há listener de `storage` event nem broadcast via `BroadcastChannel`. Adicionalmente, com `auth/multi-user` (ADR-0091..0094, EntitlementService) usuários diferentes na mesma máquina compartilham o mesmo locale persistido — não é necessariamente bug, mas é decisão arquitetural não documentada.
**Fix:** registrar listener `window.addEventListener('storage', e => e.key === LOCALE_STORAGE_KEY && setLocaleState(e.newValue ?? DEFAULT_LOCALE))` no `TranslateProvider` (cleanup via `useEffect` return). Para multi-user, considerar `g4os.locale.<userId>` se a UX prevê locales por usuário.
**ADR:** 0012 (Disposable — listener precisa cleanup), 0109.

## F-CR48-5 (MEDIUM) — bundle: ambos os catálogos (pt-BR + en-US) carregados eagerly no bundle do renderer

**Arquivo:** `packages/translate/src/messages.ts:1-10`.
**Root cause:** `messages.ts` faz `import { enUS } from './locales/en-us.ts'` + `import { ptBR } from './locales/pt-br.ts'` — ambos top-level. Resultado: o bundle do renderer carrega ~120KB de strings JSON em cada janela mesmo que o usuário só fale uma língua. Com 1336 chaves (mais essas duplicadas em outras eventuais línguas no futuro) o custo escala linearmente. Para ADR-0109 mandar "shell e auth ficam i18n-ready por contrato" significa que o pacote precisa funcionar — mas não exige que tudo carregue eager. ADR-0109 lista nas Consequências Negativas "atrito inicial para prototipar UI rápido", não menciona bundle size.
**Evidência:** confirmado em `apps/desktop/out/renderer/assets/esm-0WeJyAHw.js` (bundle build) que tanto en-US quanto pt-BR estão inline no mesmo chunk.
**Fix:** opção A (preserva API): manter `dictionaries` como Record com lazy getters via `Proxy` que faz `await import('./locales/pt-br.ts')` por demanda. Opção B (rompe API): exportar `loadLocale(locale): Promise<Dictionary>` e refatorar provider para Suspense. Opção C (pragmática hoje): aceitar custo até houver 4ª língua, mas documentar.
**ADR:** 0109 não fala de bundle, mas o princípio 4 "código que LLM consegue entender sem alucinar" não é violado por lazy load se a API é clara.

## F-CR48-6 (MEDIUM) — `TranslationParams` não permite `boolean`; consumidores caem em `as unknown` ou `String()` ad-hoc

**Arquivo:** `packages/translate/src/types.ts:3` (`Readonly<Record<string, string | number>>`).
**Root cause:** templates como `'{{enabled}} active'` ou `'shell.subsidebar.sessions.matchCount': '{{count}} match(es)'` aceitam apenas string|number. Templates que precisam de boolean (visível/oculto, on/off) precisam pré-converter no caller — disciplina manual. `Date` também não é suportado (precisa pré-formatar via `formatDate`). Não é bug, mas restringe o set de templates expressíveis e força call sites a `t(key, { active: enabled ? '1' : '0' })` ou similar.
**Fix:** ampliar para `string | number | boolean | Date` e converter via `String(value)` no resolver (já feito em `translate.ts:70`). Isso preserva a `Readonly<Record<...>>`.
**ADR:** 0002 (TS strict — type safety).

## F-CR48-7 (MEDIUM) — não há helper de pluralização (ICU-style ou Intl.PluralRules); pares `.singular`/`.plural` espalhados manualmente

**Arquivo:** múltiplos: `chat.activeBadges.sources.singular`/`.plural`, `chat.toolRenderer.bash.outputPlural`, `chat.toolRenderer.readFile.summaryPlural`, `chat.toolRenderer.search.resultsPlural`, etc. Em pt-BR `'debugHud.header.alertsOne': '{count} alerta'` — falta `.alertsMany` definir corretamente plural pt-BR (em pt-BR plural é `2+`, não como en `>1`; "0 alertas" requer `alertsMany`).
**Root cause:** sem `Intl.PluralRules`, cada call site decide manualmente qual variante usar (`count === 1 ? singular : plural`). Para línguas com plural triplo (russo, polaco) ou regras de zero (galês), o sistema não escala. ADR-0109 fala de "ampliar [línguas] depois não muda o contrato básico" — verdade, mas o contrato atual já carrega dívida com pares manuais. Para pt-BR especificamente "0 sessões" é correto plural, "1 sessão" singular, "≥2 sessões" plural — a lógica de "1 → singular, else → plural" funciona em ambos en e pt mas é frágil.
**Fix:** adicionar helper `tn(locale, keyOne, keyOther, count, params)` que usa `new Intl.PluralRules(locale).select(count)` para escolher entre `one`/`other` (ou `zero`/`one`/`few`/`many`/`other` em sinônimos). Estabelecer convenção de chaves `key.zero`, `key.one`, `key.other`. Migrar pares existentes.
**ADR:** 0109 (suporte multi-locale por contrato).

## F-CR48-8 (MEDIUM) — `dictionaries` não é frozen em runtime; mutação acidental possível

**Arquivo:** `packages/translate/src/messages.ts:7-10` e `src/locales/{en-us,pt-br}.ts`.
**Root cause:** `dictionaries` é declarado `Readonly<Record<...>>` (compile-time), e os locale files terminam com `as const` (en-US) e `satisfies Record<TranslationKey, string>` (pt-BR). Nenhum `Object.freeze` em runtime. Em testes ou hot-reload, `dictionaries['en-US']['app.name'] = 'pwn'` compila com `// @ts-expect-error` ou cast e muda o valor para todos os consumers (módulos JS são singleton). Não é vetor de ataque externo (require code execution), mas é vetor de corrupção em testes mal escritos. Custo do fix é mínimo.
**Fix:** envolver com `Object.freeze` recursivo: `export const dictionaries = Object.freeze({ 'en-US': Object.freeze(enUS), 'pt-BR': Object.freeze(ptBR) })`. Ou usar `as Readonly<Record<...>>` mais agressivo. Em dev: optional `Object.freeze` deep para detectar mutações.
**ADR:** 0011 (imutabilidade ajuda Result pattern), 0109.

## F-CR48-9 (LOW) — `@g4os/translate` sem boundary explícito em `.dependency-cruiser.cjs`

**Arquivo:** `.dependency-cruiser.cjs` (sem regra `translate-isolated`).
**Root cause:** todos os outros pacotes-leaf (kernel, platform, credentials, observability, agents-interface, auth, permissions, sources) têm regra explícita "may depend only on …". Translate é leaf real (zero deps internas hoje), mas sem regra um dev pode futuramente importar `@g4os/kernel/types` ou `@g4os/platform` sem violação. ADR-0109 implícito "translate concentra chaves tipadas" sugere zero deps. Verificação de hoje (`grep -nE "react|electron|@g4os/(ui|features|kernel|platform|ipc|data)" packages/translate/src/...`) retorna apenas a string literal `'Electron'` em settings — limpo. Adicionar regra cementa o contrato.
**Fix:** adicionar bloco em `.dependency-cruiser.cjs`:
```
{
  name: 'translate-isolated',
  comment: '@g4os/translate é leaf — zero dependências de pacotes internos',
  severity: 'error',
  from: { path: '^packages/translate' },
  to: { path: '^packages/(?!translate)' },
}
```
**ADR:** 0109 (translate é base, não consumidor).

## F-CR48-10 (LOW) — `version: "0.0.0"` em `package.json`; private mas changesets podem confundir

**Arquivo:** `packages/translate/package.json:3`.
**Root cause:** `private: true` impede publicação, mas `version: "0.0.0"` em todos os changesets aplica patch numa versão que nunca avança. Outros packages do monorepo têm o mesmo padrão — não é bug isolado de translate, mas vale mencionar para consistência. Changesets `'@g4os/translate': patch` no CR-30 etc. ficam efetivamente no-op semver. Não afeta runtime.
**Fix:** opcional — alinhar com política do repo. Se `version: 0.0.0` é convenção firme, documentar em `CONTRIBUTING.md`. Se não, bumpar para `0.1.0` na próxima release.
**ADR:** 0153 (catalog não cobre versões internas, mas convenção repo-wide).

## F-CR48-11 (LOW) — `tsconfig.json` exclui `__tests__` mas teste único usa `import { translate } from '../translate.ts'` com extensão

**Arquivo:** `packages/translate/src/__tests__/translate.test.ts:6-9`, `packages/translate/tsconfig.json:11`.
**Root cause:** `tsconfig.json` faz `"exclude": ["src/**/*.test.ts", "src/__tests__/**"]` — então o `tsc --noEmit` do package **não verifica** os testes. Vitest tem seu próprio resolver e roda OK, mas drift de tipos no test file não falha no `pnpm typecheck`. Outras práticas no monorepo incluem testes no typecheck (kernel inclui). Imports com extensão `.ts` funcionam por `verbatimModuleSyntax`+`moduleResolution: bundler` mas dependem do `tsconfig.base`.
**Fix:** remover `__tests__` do `exclude` do `tsconfig.json` (ou criar `tsconfig.test.json` separado) para que `pnpm typecheck` cubra os testes. Custo nulo, ganho real (CR-30 demonstrou type drift entre packages).
**ADR:** 0002.

---

## Áreas verificadas sem findings

- **Locale parity (paridade chaves pt-BR vs en-US):** ambos têm 1336 chaves; teste `locale parity` em `__tests__/translate.test.ts:12` é forcing function. **OK.**
- **Type generation:** `TranslationKey` derivado de `keyof typeof enUS` (en-us.ts:1590) — autocomplete funciona, missing keys = type error. **OK.**
- **Boundary (translate é leaf):** zero imports de pacotes internos confirmado por grep. **OK** (mas ver F-CR48-9 para forcing function).
- **Storage robustness:** `try/catch` em `localStorage.getItem`/`setItem` cobre Safari private mode + quota exceeded. **OK.**
- **Interpolation security (XSS via params):** `Object.hasOwn` bloqueia `__proto__`/`constructor`; testes em `__tests__/translate.test.ts:63-100` (CR12-T1) cobrem regressão. **OK** — render é texto puro, escaping é responsabilidade de React (não o package).
- **Locale fallback chain:** `translate.ts:65` faz target → DEFAULT_LOCALE → key. Testado em `falls back to DEFAULT_LOCALE`. **OK** (mas missing key behavior é silent — é intencional, não throw).
- **Intl formatters fallback:** todos os 3 (`formatDate`/`formatNumber`/`formatRelativeTime`) têm `try/catch` para RangeError em locales raros. **OK.**
- **Hot reload em dev:** Vite/tsup HMR padrão; nada custom. **OK.**
- **Catalog drift (ADR-0153):** translate sem deps externas catalogadas. N/A.
- **V1 parity:** V1 tem `apps/electron/src/renderer/i18n/index.ts` com mesma assinatura `translate(locale, key, params)`, mesmo regex `\{\{(\w+)\}\}` e mesmo fallback `current ?? fallback ?? key`. V2 evoluiu suportando dot-paths e prototype safety; V1 emite `console.warn` em DEV para missing key (V2 não — silent). **OK** (mas ver F-CR48-3 para missing-key UX).
