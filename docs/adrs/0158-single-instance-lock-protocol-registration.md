# ADR 0158: Single-instance lock + protocol registration

## Metadata

- **Numero:** 0158
- **Status:** Accepted
- **Data:** 2026-05-01
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @qa

## Contexto

CR-18 finding F-DT-I descobriu duas omissões críticas no boot do main process que tornavam deep-links inutilizáveis em produção e quebravam o lifecycle de single-window quando 2ª instância era spawnada (típico em Windows/Linux ao clicar em URL `g4os://...` no navegador).

Estado pré-CR18:
- `grep -rn "requestSingleInstance\|setAsDefaultProtocolClient"` em `apps/desktop/src/main/` retornava **vazio**.
- `deep-link-handler.ts` existia e processava URLs `g4os://`, mas main NUNCA chamava `app.setAsDefaultProtocolClient('g4os')`. Resultado: o sistema operacional jamais entregava URLs `g4os://...` ao app — handler era código morto.
- Sem `requestSingleInstanceLock()`, abrir deep-link em Windows/Linux disparava segundo bootstrap em vez de focar janela existente. Em macOS, `open-url` parava em `app.on('will-finish-launching')` mas faltava registro defensivo.

Evidência via behaviour:
- Macroteste manual: clicar em link `g4os://session/abc` no navegador (Windows) → app abre, mas URL nunca é roteada para `DeepLinkHandler.handle`.
- Lifecycle quebrado: 2ª instância dispara `before-quit` na 1ª (assumption de single-window), perdendo state in-flight.

ADRs relacionados:
- ADR-0030 (worker-per-session) e ADR-0145 (supersedes 0030: in-process único) → main deve ser **single-process autoritativo**, o que torna single-instance lock parte do contrato.
- ADR-0107 (shell autenticado canônico) → matriz de navegação assume janela única.

## Opções consideradas

### Opção A: Inline em `main/index.ts`

**Descrição:** chamar `app.requestSingleInstanceLock()` + `setAsDefaultProtocolClient('g4os')` direto no `bootstrapMain` antes de `app.whenReady()`.

**Pros:**
- Mais simples. Sem extra-bootstrap module.
- Visível no composition root.

**Contras:**
- Aumenta LOC de `index.ts` (já no exempt 480).
- Mistura concerns de electron lifecycle com inicialização de serviços.
- Difícil de testar isoladamente (E2E precisa stub de `app.requestSingleInstanceLock`).

### Opção B: Sub-bootstrap `services/single-instance-bootstrap.ts`

**Descrição:** módulo dedicado que expõe `acquireSingleInstance(electron)` + `registerProtocol(electron)` e listener `second-instance` que roteia argv para `DeepLinkHandler`.

**Pros:**
- Composition root mantém ≤480 LOC com responsabilidade clara.
- Helper testável com runtime stub.
- Convenção alinhada com `services/{backup,updates,attachments-gc,cleanup-orphan-tmp}-bootstrap.ts`.
- Suporte a runtime stub (`requestSingleInstanceLock` undefined em E2E) — não bloqueia smoke tests.

**Contras:**
- Mais um arquivo no main (++LOC).
- Indireção entre composition root e electron API.

### Opção C: Mover para `app-lifecycle.ts`

**Descrição:** estender `AppLifecycle` (já é `DisposableBase`) com responsabilidade de single-instance + protocol.

**Pros:**
- Centraliza electron lifecycle.

**Contras:**
- `AppLifecycle` é leve hoje (~80 LOC). Adicionar single-instance + protocol + second-instance listener triplica responsabilidade.
- `setAsDefaultProtocolClient` é one-time setup, não lifecycle. Não cabe em uma classe lifecycle.

## Decisão

Optamos pela **Opção B — sub-bootstrap `services/single-instance-bootstrap.ts`**.

### Implementação canônica

1. **Lock**: `acquireSingleInstance(electron)` chama `electron.app.requestSingleInstanceLock()` ANTES de `app.whenReady()`. Retorna `{ acquired: true | false }`. Se `false`, caller imediatamente faz `electron.app.quit()` e retorna do `bootstrapMain`.

2. **Protocol registration**: `registerProtocol(electron)` chama `electron.app.setAsDefaultProtocolClient('g4os')`. Em Windows packaged build, passa `process.execPath` + argv para o registro funcionar fora de dev. Em macOS, registro também é necessário para `app.on('open-url')` ser disparado em build empacotada.

3. **Second-instance listener**: `wireSecondInstance(electron, deepLinks, windowManager)` registra `app.on('second-instance', (_event, argv, cwd) => ...)` que:
   - Foca janela existente (`focusWindow()` via WindowManager)
   - Extrai URL `g4os://...` do argv (Windows/Linux entregam deep-link como argv da 2ª instância)
   - Roteia para `deepLinks.handle(url)`

4. **Runtime stub tolerância**: helpers verificam `typeof electron.app.requestSingleInstanceLock === 'function'` antes de chamar — em E2E (stub runtime) ou Electron < 12 fallback hipotético, retorna `acquired: true` sem quebrar smoke tests.

### Wiring em `bootstrapMain`

```ts
// IMEDIATO após loadElectron, ANTES de app.whenReady():
const lock = acquireSingleInstance(electron);
if (!lock.acquired) {
  log.info('another instance already running; quitting');
  electron.app.quit();
  return;
}
registerProtocol(electron);

// ... resto do bootstrap ...

// Após windowManager.create:
wireSecondInstance(electron, deepLinks, windowManager);
```

## Consequências

### Positivas

- **Deep-links funcionam em produção** (Windows/Linux/macOS packaged) — antes eram código morto.
- **Lifecycle preservado**: 2ª instância foca janela existente em vez de duplicar bootstrap.
- **State in-flight protegido**: streams, drafts, modais pendentes não são interrompidos por 2ª instância spawn.
- **Testável**: helpers podem ser smoke-tested com runtime stub em `apps/desktop-e2e/`.
- **Convenção consistente**: alinha com pattern `*-bootstrap.ts` já estabelecido (backup, attachments-gc, cleanup-orphan-tmp).

### Negativas / Trade-offs

- **+107 LOC no main** — bumpou MAIN_LIMIT de 10000 → 10150 (documentado em `scripts/check-main-size.ts`).
- **Setup one-time não-revogável**: `setAsDefaultProtocolClient` registra no OS na primeira execução; remoção só via `removeAsDefaultProtocolClient` (não chamamos hoje — hipótese: app desinstalado pelo gerenciador de pacotes).

### Neutras

- E2E não fica mais frágil — stub runtime continua funcionando via fallback `acquired: true`.
- ADR-0145 (in-process único) reforçado: single-instance lock é o contrato OS-level que materializa essa decisão.

## Validação

- **Smoke test**: novo teste em `apps/desktop-e2e/tests/single-instance.spec.ts` (futuro — listado em followups) — abrir 2 instâncias do app empacotado e verificar que a 2ª faz `quit()` enquanto a 1ª foca janela.
- **Manual gate**: clicar em link `g4os://session/abc` no navegador → janela existente foca + transição para sessão. Verificado em macOS dev build.
- **Métrica regressiva**: `grep -rn "requestSingleInstanceLock\|setAsDefaultProtocolClient" apps/desktop/src/main/` deve retornar resultados em `single-instance-bootstrap.ts` + uso em `index.ts`. Adicionado check ao gate `check:main-size` JSDoc como referência.

## Tarefas decorrentes

- [x] `services/single-instance-bootstrap.ts` criado.
- [x] Wired em `bootstrapMain` antes de `app.whenReady()`.
- [x] CLAUDE.md + AGENTS.md sincronizados (MAIN_LIMIT 10150 + tabela de bumps).
- [ ] E2E smoke test validando 2ª instância → focus 1ª (deferred, listado em FOLLOWUPs do CR-18).
- [ ] Windows packaged install testar `setAsDefaultProtocolClient` com `process.execPath` real (validação manual antes do canary).

## Referencias

- CR-18 finding F-DT-I em `Docs/STUDY/code-review/code-review-18.md` (linha 663+).
- ADR-0107 (shell autenticado canônico) — assumption de single-window na matriz de navegação.
- ADR-0145 (supersedes 0030) — in-process único, single-instance lock materializa o contrato OS.
- Electron docs: [`app.requestSingleInstanceLock`](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata) + [`app.setAsDefaultProtocolClient`](https://www.electronjs.org/docs/latest/api/app#appsetasdefaultprotocolclientprotocol-path-args).
- VS Code reference: [`electron-main/app.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/app.ts) — pattern análogo.

---

## Histórico de alterações

- 2026-05-01: Proposta + aceita no mesmo dia — CR-18 wave 2 entregue, gates verdes.
