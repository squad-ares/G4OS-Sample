---
'@g4os/permissions': patch
'@g4os/desktop': patch
'@g4os/kernel': patch
---

Code Review 42 — packages/permissions — 12 findings (1 CRITICAL + 4 MAJOR + 5 MEDIUM + 2 LOW)

Permissions é layer de segurança — bypass aqui é catastrófico. Ainda
assim, o pacote está em estado bom: store e broker têm cobertura sólida
de testes regressivos (CR-18 F-PE1/PE2/PE4/SR2/DT-L), persistência via
`writeAtomic` + mutex per-workspace, redação dupla (key+value) em
`previewArgs`, coalesce de in-flight, downgrade `allow_always → allow_session`
para `run_bash`. O risco principal hoje não está nos bugs de lógica
do broker em si — está em **wiring de lifecycle no `apps/desktop` que NÃO
chama `permissionBroker.dispose()` no `onQuit`** e em **gaps de validação
de schema persistido** que permitem disco corrompido/atacante envenenar
estado em memória.

---

## CRITICAL

**F-CR42-1 — `permissionBroker.dispose()` nunca é chamado no shutdown (CRITICAL)**.
Path: `apps/desktop/src/main/index.ts:227-240` cria
`permissionBroker = new PermissionBroker(...)`, mas nenhum
`lifecycle.onQuit(() => permissionBroker.dispose())` é registrado (apenas
`attachmentsGcDisposable`, `debugHud`, `globalShortcut`, `tray` no mesmo
arquivo). Consequências em SIGINT/SIGTERM/quit:
1. Pendências `#pending` não são rejeitadas — Promises pendentes vazam
   (`tool-execution.ts:151` aguarda `Promise.race` que nunca resolve, mas
   também o caller upstream do tool-loop). Em prática `app.exit(0)` mata
   o processo, mas o vazamento é detectável em testes de longa duração e
   viola o contrato `IDisposable` (ADR-0012).
2. Cache `#sessionAllow` cresce indefinidamente entre sessões reabertas —
   `clearSessionAllow(sessionId)` é exposta pelo broker (linha 332 de
   `permission-broker.ts`) **mas NUNCA é chamada de lugar algum** (grep
   confirma 0 call sites em `apps/`+`packages/`). Idem `cancelRequest(requestId)`
   (linha 315) — exposta, sem call site.
3. Side-effect: testes E2E que reusam o mesmo broker entre sessions
   acumulam decisões `allow_session` cross-test silenciosamente.
**Root cause**: extração para `@g4os/permissions` (ADR-0134) moveu
broker pra package isolado, mas o composition root em
`apps/desktop/src/main/index.ts` não foi atualizado para registrar o
disposer no `lifecycle.onQuit`.
**Fix**: em `index.ts`, após criar o broker:
```ts
lifecycle.onQuit(() => {
  permissionBroker.dispose();
  return Promise.resolve();
});
```
E registrar hook em `SessionsService.archive/close` ou
`SessionLifecycleManager` chamando `permissionBroker.clearSessionAllow(id)`
+ `cancelPendingForSession(id)` quando sessão termina (não apenas em
`turn-dispatcher.interrupt`). ADR-0012, ADR-0134.

---

## MAJOR

**F-CR42-2 — `respond('allow_always')` retorna decisão mesmo com persist falhando (MAJOR)**.
Path: `packages/permissions/src/permission-broker.ts:270-291`. Quando
`store.persist()` lança (disk-full, FS read-only, lock timeout), o
`catch` apenas loga `'failed to persist allow_always — proceeding with
allow_once for current turn'`, mas a linha 290 segue resolvendo com
`effectiveDecision` (= `'allow_always'`), não `'allow_once'`. Caller
recebe `allow_always` e o tool-loop trata como aprovado-permanente, mas
**no próximo turn o broker pergunta de novo** (store está vazio). Pior:
se `pending.workspaceId === undefined` ou `!this.#store`, o broker
**silenciosamente trata `allow_always` como se persistisse**, sem nem
tentar logar o downgrade. A discrepância entre log e comportamento
mascara falhas reais de persistência em produção.
**Root cause**: comentário do CR-18 F-PE4 ("await persist + fsync ANTES
de resolver") + log message não foram alinhados ao retorno efetivo.
**Fix**: em catch da persist, setar `effectiveDecision = 'allow_once'`
antes do `pending.resolve(...)`. E quando `pending.workspaceId` ausente
ou `!this.#store`, downgrade explícito para `allow_session` (ou `allow_once`)
+ log warn — nunca resolver com `allow_always` se persistência for
no-op. ADR-0011 (Result), ADR-0134.

**F-CR42-3 — Schema de decisão persistida aceita strings sem cap nem formato (MAJOR)**.
Path: `packages/kernel/src/schemas/permission.schema.ts:44-49`. Schema
atual:
```ts
toolName: z.string().min(1),
argsHash: z.string().min(1),    // aceita "x", aceita 100MB de string
argsPreview: z.string(),        // sem .max
decidedAt: z.number().int().positive(),
```
Sem `.max()` em `toolName`/`argsPreview`/`argsHash` e sem `.regex(/^[a-f0-9]{32,64}$/)`,
um arquivo `permissions.json` corrompido/adversário pode injetar:
- `toolName: <100MB>` → broker carrega no memory map
- `argsHash: '../../etc/passwd'` → não há path-injection (não é usado em
  filename) mas viola invariante
- `argsPreview` sem cap pode ter o que for (a UI em `permissions-category.tsx`
  renderiza diretamente — risco de XSS depende do renderer; checagem rápida
  mostra `{decision.argsPreview}` em React, que é safe por default,
  mas qualquer mudança para `dangerouslySetInnerHTML` vira RCE).

Em contraste, `permissions-router.ts` (IPC) caps em `toolName.max(256)`,
`argsHash.regex(/^[a-f0-9]+$/).max(64).min(32)`, `argsPreview.max(256)` —
o boundary IPC é defensivo, mas o boundary disk não é. Ataque concreto:
attacker com acesso a `permissions.json` (malware no FS) tampera, broker
parsea sem rejeitar, e a decisão tampered passa por `find()` resolvendo
permissões para inputs arbitrários.
**Root cause**: schema modelado em CR-18 com foco no happy path. Não
há gate de "schema persisted == schema IPC".
**Fix**: alinhar `ToolPermissionDecisionSchema` em `kernel/schemas/permission.schema.ts`
aos mesmos caps do `permissions-router.ts` (`toolName.max(256)`,
`argsHash.regex(/^[a-f0-9]+$/).max(64)`, `argsPreview.max(256)`). Bonus:
adicionar `.refine(d => d.argsHash.length === 32 || d.argsHash.length === 64)`
para enforce os comprimentos legítimos. ADR-0153.

**F-CR42-4 — `version: z.literal(1)` quebra ao ler arquivo de versão futura (MAJOR)**.
Path: `packages/kernel/src/schemas/permission.schema.ts:52-55` +
`packages/permissions/src/permission-store.ts:198-220`. Quando
`ToolPermissionsFileSchema.parse` falha (e.g., usuário fez downgrade de
um build futuro com `version: 2`), o `catch` em `readFile` trata como
**corrupção** e move para `.corrupt.<ts>`, perdendo silenciosamente todas
as decisões `allow_always` aprovadas. Não há diferenciação entre
"JSON parse error" (real corrupção) e "schema version mismatch"
(downgrade legítimo). Usuário rebaixando build do canary pra stable
**perde todas as permissões `allow_always`** sem saber o motivo — só
um log `warn` em `permissions.json parse failed`.
**Root cause**: store coleciona qualquer falha de parse como corrupção.
**Fix**: tentar parse leve `{ version: number }` antes — se versão
desconhecida, retornar `{ version: 1, decisions: [] }` (ou bloquear
escrita) sem mover para `.corrupt`. Migration handler explícito quando
`version > 1` for introduzido. ADR-0134.

**F-CR42-5 — Sem timeout / sem cap em `request.input` (MAJOR)**.
Path: `packages/permissions/src/permission-broker.ts:32-42`. Tipo de
input é `Readonly<Record<string, unknown>>`. Não há validação Zod sobre
o `input` antes de:
1. `hashArgs(input)` — `stableStringify` recursa via `Reflect.ownKeys`.
   Objeto profundo (depth 100k) **não tem cap de profundidade** — RecursionError
   travaria o broker (já existe guard contra ciclos via `visited`, mas não
   contra DAG profundo legítimo).
2. `safeJson(input)` — sem max length. Tool com 50MB de input embedded
   (ex.: `write_file` com base64 binário) tem o JSON inteiro emitido como
   `inputJson` no `turn.permission_required`, atravessando IPC →
   renderer → React render. UI trava, mas pior: o `argsPreview` no
   `previewArgs` também serializa o objeto inteiro antes de truncar
   (linha 339-343 store).
**Root cause**: contrato confia no caller (tool-loop) para sanitizar.
Mas tool input vem do agent LLM — fonte adversarial.
**Fix**: em `request()`, validar via Zod com cap de tamanho serializado
(ex.: `JSON.stringify(input).length < 256_000`) e profundidade
(ex.: depth ≤ 10). Em violação, log warn + auto-deny sem emitir modal.
Aplica também em `previewArgs` para evitar serializar megabytes antes
de truncar. ADR-0011.

---

## MEDIUM

**F-CR42-6 — `cancel(sessionId)` limpa `#sessionAllow` mas `cancelPendingForSession` é chamado no abort (MEDIUM)**.
Path: `packages/session-runtime/src/tool-execution.ts:179-181`. Quando
turn é abortado mid-tool, `cancelPendingForSession` preserva
`#sessionAllow` (correto pra evitar reaprovar tudo). Mas `cancel(sessionId)`
do broker (linha 294-303) **continua existindo**, é chamada por
`turn-dispatcher.ts:345` em `interrupt(sessionId)`, e LIMPA o
`#sessionAllow`. Se um `interrupt` acontece logo após um abort
(double-cancel), o usuário perde decisões `allow_session` recentes.
Pior: a documentação JSDoc do `cancel` diz "rejeita pendências + limpa
cache `allow_session`" — comportamento agressivo, mas o nome `cancel`
sugere apenas cancelar pendências (igual a `cancelPendingForSession`).
**Root cause**: API `cancel` faz duas coisas (cancel pendências + clear
cache) com nome ambíguo. CR-18 F-SR2/PE3 introduziu APIs granulares
(`cancelPendingForSession`, `clearSessionAllow`) mas `cancel` legacy
permanece como atalho perigoso.
**Fix**: deprecar `cancel(sessionId)` em favor de
`cancelAndClear(sessionId)` ou separar em duas chamadas explícitas no
caller. Auditar `turn-dispatcher.ts:345` — chamar `clearSessionAllow`
apenas quando sessão termina, não em todo `interrupt`. ADR-0134.

**F-CR42-7 — Timeout de 5 min auto-deny não emite evento UI (MEDIUM)**.
Path: `packages/permissions/src/permission-broker.ts:176-186`. Quando
timeout expira (5 min sem resposta), broker resolve a Promise com
`'deny'` e remove a pendência. Mas **a UI ainda renderiza o modal**
porque o `turn.permission_required` event já foi emitido no bus, e não
há contra-evento `turn.permission_resolved` ou `turn.permission_timeout`.
Modal fantasma fica na queue do `PermissionProvider` (ADR-0116) até o
usuário fechar manualmente — clique nele faz `respond(requestId, ...)`
que retorna `false` (pendência já consumida pelo timeout) e o caller
não recebe feedback do que aconteceu.
**Root cause**: timeout é puramente backend; não emite evento de
resolução para a UI.
**Fix**: no callback de timeout, antes de resolver, chamar
`onRequest`-equivalente que emita `turn.permission_resolved` (com
`decision: 'deny'`, `reason: 'timeout'`). Renderer descarta o modal
correspondente. Ou alternativa mínima: tornar timeout configurável
via `requestTimeoutMs` por request (não global) e log info ao usuário.
ADR-0116, ADR-0134.

**F-CR42-8 — `argsPreview` redação não cobre tokens em chave aninhada profunda + Slack/Discord/AWS (MEDIUM)**.
Path: `packages/permissions/src/permission-store.ts:299-317`. Lista de
`SECRET_VALUE_PATTERNS` cobre Anthropic/OpenAI (sk-), Google AIza,
GitHub gh*, Slack xox*, JWT, Bearer, Notion. Faltam:
- AWS access keys: `AKIA[A-Z0-9]{16}`
- AWS secret access key: `[A-Za-z0-9/+=]{40}` (heurística com prefixo)
- Discord bot token: `[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}`
- Stripe: `sk_live_[A-Za-z0-9]{24,}` / `pk_live_*`
- Sendgrid: `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}`
- Google Service Account JSON (chave `private_key` matcha SENSITIVE_KEY_RE
  apenas se `private_key` for exatamente a chave; chaves prefixadas
  `gcp_private_key` etc. funcionam, mas `service_account_key`
  não tem `^|_|-|\.private_key$` pattern — falha).
- Regex `SENSITIVE_KEY_RE` ancorada com `(?:^|_|-|\.)` falha em chaves
  como `myApiKey` ou `userApiKey` (sem separador antes do `apiKey`).
  Test em `previewArgs` cobre `apiKey:` mas não `myApiKey:`.
**Root cause**: lista de padrões + regex de chave não revisitadas após
adoção; não há test cross-provider.
**Fix**: expandir `SECRET_VALUE_PATTERNS` (AWS/Stripe/Sendgrid/Discord)
e relaxar `SENSITIVE_KEY_RE` para aceitar prefixos camelCase
(`/(?:^|[_\-.A-Z])(?:api[_-]?key|...)$/i` com `[A-Z]` permitido como
boundary). Snapshot test parametrizado por provider. ADR-0134.

**F-CR42-9 — `find()` aceita legacy 32-char hash sem rate-limiting / log auditoria (MEDIUM)**.
Path: `packages/permissions/src/permission-store.ts:112-127`. Match aceita
`d.argsHash === legacyHash` (prefixo 32 chars do hash full 64). Em teoria,
duas tools distintas com mesmos primeiros 32 chars de SHA-256 colidem —
probabilidade desprezível (2^-128) na prática. Porém: não há **log
auditável** quando match acontece via legacy hash (linha 130-134 loga
`auto-resolved via allow_always store` mas sem distinguir full vs legacy).
Operador não consegue identificar usuários ainda em legacy formato vs
migrados. Não há plano de fim de suporte ao legacy hash.
**Root cause**: migration foi introduzido (CR5-24) mas sem telemetria
de uso.
**Fix**: log info `legacy hash matched` quando `d.argsHash === legacyHash`
em find. Métrica Prometheus `permissions_legacy_hash_matches_total` para
saber quando deprecar (zero hits por N dias = remover suporte). ADR-0064.

**F-CR42-10 — `previewArgs` redaction expande string antes de truncar (MEDIUM)**.
Path: `packages/permissions/src/permission-store.ts:339-343`. Order of
operations:
1. `redactValue(input)` — recursa o objeto inteiro, substituindo
   matches por `[REDACTED]`. Se input tem 10MB, output ainda tem ~10MB.
2. `JSON.stringify(safe)` — serializa 10MB.
3. Truncate em 200 chars.
Custo: aloca 10MB em memória pra entregar 200 chars. Em tools com input
grande (`write_file` com 5MB body), broker faz 5MB de alocação por
permission request — multiplica em concurrent requests, pressiona GC
de main process. F-CR42-5 cobre o input cap em si, mas mesmo após cap
de 256kb, fazer redação completa antes de truncar é desperdício.
**Fix**: truncar primeiro JSON puro (sem redação) para ~1024 chars,
depois redacted. Como redação substitui por `[REDACTED]` (string
fixa), a truncated version pode ainda ser maior que 200 chars com
redação — fazer pass único: serializar streaming, parar em 1024 chars,
aplicar redaction sobre essa string já truncada. Mais simples: mover
truncate para antes do JSON full + ainda aplicar `redactSecretValueChars`
na string final. ADR-0134.

---

## LOW

**F-CR42-11 — `dispose()` não cancela timeouts via `unref` (LOW)**.
Path: `packages/permissions/src/permission-broker.ts:356-366`. Em
`dispose()`, itera `#pending` e chama `clearTimeout(pending.timeoutHandle)`
+ `pending.reject(...)`. Mas **se `dispose()` foi chamado fora do
event loop** (ex.: dentro do `process.exit(0)` handler com beforeExit),
o `clearTimeout` é tarde demais — handle já estava agendado. Em prática
`unref()` (linha 188) já desacoplou o timer do event loop, então
`process.exit` não espera. Mas o reject de Promises pendentes pode
nunca rodar (microtask queue não é drenada em `process.exit`). Caller
upstream que aguardava a Promise nunca recebe feedback.
**Root cause**: dispose síncrono. Em shutdown deadline (ADR-0032),
`AppLifecycle` aguarda 5s — basta integrar dispose ao onQuit (F-CR42-1)
para resolver isso indiretamente.
**Fix**: documentado pelo F-CR42-1. ADR-0032.

**F-CR42-12 — `safeJson` retorna `'{}'` em fallback silenciando erros (LOW)**.
Path: `packages/permissions/src/permission-broker.ts:400-406`. Quando
`JSON.stringify(input)` lança (BigInt, circular, TypedArray sem
serializer), retorna `'{}'`. UI renderiza modal com input vazio,
usuário aprova "what?". Cobre o crash mas mascara que o broker recebeu
input malformado. Idealmente:
1. `hashArgs` já cobre BigInt + circular (linha 247, 259) e lança em
   ciclo. Então `request()` já falharia em `hashArgs` antes de chegar
   em `safeJson`.
2. Mas há outras shapes (DataView, Map, Set) que `JSON.stringify`
   retorna `{}` sem lançar — UI renderiza vazio sem warning.
**Fix**: usar `stableStringify` em vez de `JSON.stringify` para
consistência (já lida com BigInt). Em fallback, log warn explicito com
`typeof input` + chaves disponíveis. ADR-0134.

---

## Áreas auditadas (cobertura)

- **Bypass paths**: zero — toda invocação de tool em `tool-execution.ts`
  passa por `permissionBroker.request()` antes de `handler.execute()`.
  Catalog em `agents/tools/handlers/` não é chamado direto em nenhum
  lugar do main fora do tool-loop. OK.
- **Default-deny**: timeout → `'deny'`; callback throw → `'deny'`;
  unknown tool em catalog → `isError: true`. OK.
- **Idempotência approvals**: `respond()` consulta `#pending.get` —
  segunda chamada com mesmo `requestId` retorna `false` sem efeito. OK.
- **Race approval+cancel**: testado por F-PE4 (cancel mid-persist não
  rejeita Promise resolvida). OK.
- **Persistent grants**: `allow_always` persiste em
  `permissions.json` per-workspace; `allow_session` em memória + scope
  per-session; `allow_once` não persiste. Nunca expiram (não há TTL —
  intencional, usuário revoga em Settings). OK.
- **Modal queue (ADR-0116)**: queue UI vive em
  `packages/features/src/chat/permissions/`. Broker emite via
  `onRequest` callback síncrono — F-PE1 cobriu callback síncrono. UI
  serializa modais. OK.
- **Broker single source of truth (ADR-0134)**: confirmed. Único
  `PermissionBroker` instanciado em `apps/desktop/src/main/index.ts:227`.
- **Agent registers risks (ADR-0077)**: out-of-scope deste pacote;
  ADR-0077 cobre system de tool catalog; este broker é o gate, não o
  registry.
- **Result/Disposable**: F-CR42-1 (dispose missing), F-CR42-2 (Result
  semantics broken on persist failure).
- **Boundary**: cruiser `permissions-isolated` enforça só kernel —
  verificado.
- **Logs**: `createLogger('permission-broker')` + `'permission-store'`.
  Decisões logam `requestId/sessionId/decision/toolName`. Sem PII —
  `argsPreview` na persistência tem redação dupla. OK.
- **Schema validation**: F-CR42-3 + F-CR42-4 cobrem gaps.
- **Token/scope hijack**: scope vai como `PermissionDecision` literal
  (`'allow_once' | 'allow_session' | 'allow_always' | 'deny'`) — não
  passável arbitrariamente. OK.
- **Memory leaks**: F-CR42-1 + F-CR42-7 cobrem.
- **TS strict (ADR-0002)**: tsconfig estende base (strict). Sem `any`,
  sem `@ts-ignore`. OK.
- **TODO/FIXME/console.log/debugger**: zero ocorrências em
  `packages/permissions/src/`.
- **Catalog drift (ADR-0153)**: package.json usa `catalog:` para
  `@types/node` e `vitest`. OK.
- **V1 parity**: V1 tinha `PermissionManager` em
  `packages/shared/src/agent/core/permission-manager.ts` baseado em
  modes (`safe/ask/allow-all`) + allowlists configuráveis. V2 trocou
  paradigma para per-tool/per-args decisions com persistência fina.
  Gap intencional (V2 é mais granular), mas: V1 tinha
  `DANGEROUS_COMMANDS` set (rm/sudo/chmod/dd/...) que **nunca** eram
  auto-aprovadas. V2 confia 100% no usuário ler o `cmd` no modal —
  attacker que injeta `‎ rm -rf $HOME` em prompt invisível pode
  passar despercebido. Considerar lista mínima de "always-ask-confirm"
  patterns (rm -rf, sudo, dd, mkfs, chmod 777) que rejeitam
  `allow_always` mesmo em tools persistíveis. (Já há `nonPersistableTools:
  ['run_bash']` — mas não cobre `write_file` com path destrutivo.)
- **Tests edge cases**: testes existentes cobrem deny, cancel, dispose,
  coalesce, persist, redaction, circular, legacy hash. **Não cobrem**:
  timeout auto-deny → caller recebe deny; respond after dispose;
  cancelRequest individual (existe API, sem teste); `clearSessionAllow`
  (existe API, sem teste); persist throwing (F-CR42-2 acima);
  workspaceId undefined + allow_always.

---

**Severidade resumo**: 1 CRITICAL (lifecycle leak) + 4 MAJOR (semântica
de respond, schema disco, version migration, input cap) + 5 MEDIUM
(API ambígua, timeout silencioso, redação cobertura, hash audit,
redação eficiência) + 2 LOW (dispose timing, safeJson). Nenhum bypass
direto encontrado — broker bloqueia toda execução de tool.
