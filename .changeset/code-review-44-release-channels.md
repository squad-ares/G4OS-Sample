---
'@g4os/release-channels': patch
'@g4os/desktop': patch
---

Code Review 44 — packages/release-channels — 13 findings (1 MAJOR / 6 MEDIUM / 6 LOW). 0 BLOCKER. Pacote tipos puro + helpers; sem network/IO próprio (auto-updater real vive em `apps/desktop/src/main/services/update-service.ts` + `updates-bootstrap.ts`).

Áreas cobertas: channel definitions, feed URL helper, rollout scheduler, feature flag gating, promotion criteria, schemas Zod, tipagem strict, integração com `UpdateService` (apps/desktop), boundary, V1 parity (V1 `auto-update.ts` + `viewer/api/release-feed-url`).

---

**F-CR44-1 — Pacote órfão: zero importers em V2 (MAJOR)**.
Ref: `packages/release-channels/src/index.ts` (todo).
Contexto: ADR-0146 + TASK-15-04 + TASK-12-05 são os justificadores do pacote. Hoje zero arquivo em `apps/**` ou `packages/**` faz `import ... from '@g4os/release-channels'`. `apps/desktop/src/main/services/update-service.ts:4` re-declara `export type UpdateChannel = 'stable' | 'beta' | 'canary'` em vez de importar `ReleaseChannel` deste pacote. Resultado: drift garantido (qualquer mudança de canais aqui não propaga; user pode adicionar `'dev'` a um lado e não ao outro). Pacote não tem ADR próprio justificando a existência isolada (só helpers prematuros).
Root cause: scaffolding de TASK-15-04 sem wire na infra de update já implementada (TASK-12-05).
Fix: (a) `update-service.ts` passa a `import type { ReleaseChannel } from '@g4os/release-channels'` e usar como `UpdateChannel`; (b) `updates-bootstrap.ts` idem; (c) `electron-builder.config.ts` `${channel}` template não muda mas o tipo TS dos consumers passa pelo pacote; (d) ou alternativa minimalista: deletar o pacote enquanto não há consumer (ADR-0011/0012 são sobre Result/Disposable, não autorizam dead code prematuro). CLAUDE.md/AGENTS.md já listam o pacote — mantê-lo é a opção mais barata se wire imediato. Recomendo (a)+(b).
ADR: ADR-0146 (sub-decisão "channel constantes vivem em pacote dedicado, não em apps/desktop"); CLAUDE.md "Boundaries enforcadas".

**F-CR44-2 — `feedUrlForChannel` é dead code e o formato está errado (MEDIUM)**.
Ref: `src/index.ts:205-208`.
Contexto: V2 produção usa `electron-builder` com `publish: [{ provider: 's3', endpoint: R2_ENDPOINT, bucket, path: '${channel}/${os}/${arch}', region: 'auto' }]` (`apps/desktop/electron-builder.config.ts:188-198`). electron-updater resolve `latest-mac.yml`/`latest-linux.yml`/`latest.yml` por-plataforma a partir desse `publish`, não consome `feedUrlForChannel`. A função aqui devolve `${base}/${channel}/latest.yml` — formato singular sem awareness de plataforma. Comentário JSDoc cita `s3://g4os-releases/<channel>/latest.yml` que não bate com o que electron-builder grava (`${channel}/${os}/${arch}/latest-<os>.yml`). Quem chamar isso vai consultar URL inexistente.
Root cause: helper nasceu antes do `publish` block ser definido; ninguém revalidou.
Fix: ou (a) deletar `feedUrlForChannel` + `ChannelMeta` (não tem caller), ou (b) renomear para `feedBaseForChannel` retornando `${base}/${channel}` e documentar que electron-updater appenda o filename por-plataforma. Recomendo (a) até existir consumer real.
ADR: ADR-0146 (publish provider s3 + path template).

**F-CR44-3 — `parseFeatureFlags`/`parseRolloutSchedule` viola ADR-0011 (Result pattern) (MEDIUM)**.
Ref: `src/index.ts:95-98`, `149-152`.
Contexto: ADR-0011 é explícito: "Erros esperados são tipos, não exceptions. Vale também para helpers internos, não só services públicos: validações em file-ops, parsers, factories de erro retornam `Result` para que o tipo do erro propague na cadeia". Esses dois parsers retornam `T | null` — caller perde o `ZodError` (mensagem de campo, path do erro), o que é exatamente o que ADR-0011 condena ("erro silencioso", "tratamento inconsistente"). Comentário "caller decide se cai no `FEATURE_FLAGS` default ou propaga erro" admite o problema mas não corrige.
Root cause: padrão escolhido antes do enforcement de ADR-0011 nos helpers internos.
Fix: trocar assinaturas para `Result<readonly FeatureFlag[], ZodError>` e `Result<RolloutSchedule, ZodError>` via `neverthrow`. Adicionar `neverthrow: catalog:` ao package.json (já catalogado, ADR-0153).
ADR: ADR-0011.

**F-CR44-4 — `PromotionCriteria` sem schema Zod nem bounds (MEDIUM)**.
Ref: `src/index.ts:42-69`.
Contexto: comentário no topo diz "schemas Zod permitem validação runtime quando o auto-updater for wired e ler `latest.<channel>.yml` ou similar". `FeatureFlag` e `RolloutSchedule` ganharam schema; `PromotionCriteria` não — apesar de também vir de input externo (operator-authored YAML/Sentry config). `minCrashFreeRate` é `number` puro (TS não impede `1.5` ou `-0.2`), `evaluationWindowHours` aceita `0` ou negativo silenciosamente, `maxOpenP0Bugs` aceita `-3`, `minUserFeedbackScore: number | null` aceita `999`. Default `minUserFeedbackScore: 4.0` para stable + Zod ausente = Sentry job de promoção pode passar criteria malformado e nem perceber.
Root cause: schema esquecido na rodada anterior.
Fix:
```ts
export const PromotionCriteriaSchema = z.object({
  minCrashFreeRate: z.number().min(0).max(1),
  evaluationWindowHours: z.number().int().positive(),
  maxOpenP0Bugs: z.number().int().nonnegative(),
  minUserFeedbackScore: z.number().min(0).max(5).nullable(),
});
export const parsePromotionCriteria = (i: unknown) => PromotionCriteriaSchema.safeParse(i);
```
ADR: ADR-0011 (runtime validation em input externo).

**F-CR44-5 — `DEFAULT_PROMOTION_CRITERIA` quebra se 4º canal for adicionado (MEDIUM)**.
Ref: `src/index.ts:53-69`.
Contexto: tipo é `Record<Exclude<ReleaseChannel, 'canary'>, PromotionCriteria>`. Se amanhã for adicionado canal `'dev'` (a tarefa que pediu este review menciona explicitamente "stable/beta/dev/canary corretos?", sinal de que pode haver expansão), `Exclude<ReleaseChannel, 'canary'>` passa a incluir `'dev'` automaticamente e o objeto literal aqui deixa de bater com o Record — TS *vai* pegar isso, mas a forma como está expressa torna a regra "canary é o único excluído da matriz de promoção" implícita. Melhor explicitar: chave do Record = canal-destino da promoção, e listar manualmente.
Root cause: tipo expressa via exclusão em vez de enumeração positiva.
Fix:
```ts
type PromotionTarget = 'beta' | 'stable';
export const DEFAULT_PROMOTION_CRITERIA: Record<PromotionTarget, PromotionCriteria> = { ... };
```
Adiciona forcing function: novo canal exige decisão explícita sobre se ele é destino de promoção.
ADR: ADR-0002 (TS strict — preferir enum positivo a exclusão).

**F-CR44-6 — `rolloutPercentAt` aceita schedule com `percent` fora de [0,100] e `atHour` negativo no caminho não-parseado (MEDIUM)**.
Ref: `src/index.ts:172-189`.
Contexto: a função tipa `schedule: readonly RolloutEntry[]` mas `RolloutEntry` é apenas a interface TS sem validação runtime. `RolloutEntrySchema` valida `percent: 0..100`, `atHour: int >= 0`, mas só executa se o caller passar pelo `parseRolloutSchedule`. Caller que monta `RolloutEntry[]` em código (incluindo o próprio `DEFAULT_ROLLOUT_SCHEDULE`) bypassa o schema. Se alguém escreve `{ atHour: -1, percent: 150 }` em config, função retorna 150 sem warning. Outro caso: `releaseStartedAt > now` retorna 0 silenciosamente — pode ser intencional ("ainda não começou"), mas sem nenhum sinal/log o operator não distingue de "schedule vazia". Magic number `3_600_000` (ms/hora) sem const nomeada.
Root cause: validação só no boundary externo; não há defensive na função pura.
Fix:
- Extrair `MS_PER_HOUR = 3_600_000 as const` em topo do arquivo.
- Em `rolloutPercentAt`, validar `entry.percent ∈ [0,100]` e `entry.atHour >= 0` antes de aceitar — entries inválidas viram 0 ou throw `AppError(ErrorCode.VALIDATION_ERROR)` segundo política do caller. Como helper puro, throw em invariante violada é aceitável (ADR-0011: "exceptions só para bugs").
- Documentar `releaseStartedAt > now ⇒ 0` como contrato.
ADR: ADR-0011 (helpers puros + invariantes).

**F-CR44-7 — Sem testes em pacote que já teve regressão (MEDIUM)**.
Ref: pacote inteiro — `find packages/release-channels -name '*.test.ts'` retorna 0.
Contexto: changeset `release-channels-pack-review.md` documentou bug em `rolloutPercentAt` (schedule desordenada → percent errado). Fix foi aplicado mas nenhum teste foi escrito para regression. CLAUDE.md "Testing Strategy": "Unit ≥ 90% em `packages/kernel`, `packages/data`, lógica pura". Este pacote é 100% lógica pura — alvo natural.
Root cause: scaffolding sem suite de teste.
Fix: criar `src/__tests__/{rollout-percent.test.ts,feature-flags.test.ts,feed-url.test.ts}` cobrindo:
- `rolloutPercentAt`: empty schedule, before start, exact boundary, sorted, **unsorted** (regression CR-18 F-RC1), past last entry.
- `isFlagEnabled`: flag presente em stage, ausente em stage, key inexistente.
- `parseFeatureFlags`/`parseRolloutSchedule`: input válido, inválido (campo a mais, tipo errado), array vazio.
- `feedUrlForChannel` (se mantido): trailing-slash múltiplo, base sem slash. (cf. F-CR44-2: provavelmente apagar a função antes).
ADR: ADR-0011 + CLAUDE.md "Testing Strategy".

**F-CR44-8 — `FeatureFlagListSchema`/`stages` aceita duplicatas e flag-key duplicada (LOW)**.
Ref: `src/index.ts:82-88`, `105-112`.
Contexto: `stages: z.array(ReleaseChannelSchema)` aceita `['canary', 'canary', 'beta']`. `FeatureFlagListSchema = z.array(FeatureFlagSchema)` aceita 2 entries com mesmo `key`. `isFlagEnabled` faz `find` (first-match-wins) e ignora silenciosamente o resto — operator não percebe o duplicado.
Fix:
```ts
stages: z.array(ReleaseChannelSchema).transform((s) => Array.from(new Set(s))),
// ou .refine((s) => new Set(s).size === s.length, 'stages duplicated')

FeatureFlagListSchema = z.array(FeatureFlagSchema).refine(
  (xs) => new Set(xs.map((f) => f.key)).size === xs.length,
  'duplicate flag key'
);
```
ADR: ADR-0011 (validação rigorosa em input externo).

**F-CR44-9 — Header JSDoc cita "scripts em `tools/release/`" que não existem (LOW)**.
Ref: `src/index.ts:13-15`.
Contexto: comentário diz "Decisões operacionais (quando promover, quanto rolar gradualmente) vivem nos scripts em `tools/release/`". `find G4OS-V2 -path '*/tools/release/*'` retorna 0 resultados. Doc apodrece o leitor (CLAUDE.md "Comentários e documentação": "Nunca referencie código atual ou tasks transitórias — isso pertence ao PR description e apodrece").
Fix: remover a referência ou substituir por "scripts de promoção (a serem criados em TASK-15-04 step 5)".
ADR: CLAUDE.md "Comentários e documentação".

**F-CR44-10 — `FEATURE_FLAGS` `readonly` é só compile-time (LOW)**.
Ref: `src/index.ts:105-112`.
Contexto: `readonly FeatureFlag[]` é marker TS — JS runtime aceita `(FEATURE_FLAGS as FeatureFlag[]).push(...)`. Catálogo estático que vai ser consultado em hot-path do auto-updater merece freeze de runtime para evitar mutação acidental cross-package.
Fix:
```ts
export const FEATURE_FLAGS: readonly FeatureFlag[] = Object.freeze([
  // entries aqui também devem ser freezadas se contiverem nested arrays:
  // ex.: Object.freeze({ key, description, stages: Object.freeze([...]) })
]);
```
ADR: ADR-0012 (analogia: imutabilidade explícita > convenção).

**F-CR44-11 — `tsconfig.base.json` references não inclui release-channels (LOW)**.
Ref: `tsconfig.base.json:38-60`.
Contexto: `references[]` lista kernel/platform/ipc/credentials/data/ui/desktop. Faltam **vários** pacotes (agents, sources, features, auth, observability, session-runtime, permissions, translate, **release-channels**). Resultado: `tsc -b` da raiz não cobre o pacote. CLAUDE.md afirma `pnpm typecheck` cobre o workspace, mas via Turbo (per-pacote) — não via project references nativo do TS.
Fix: adicionar `{ "path": "./packages/release-channels" }` (ou aceitar que `references` está obsoleto e fazer um sweep separado). Não bloqueia este PR.
ADR: ADR-0002 (config TS canônica).

**F-CR44-12 — `evaluationWindowHours` integer sem validação semântica (LOW)**.
Ref: `src/index.ts:46`, `59`, `65`.
Contexto: defaults `72` e `168` são razoáveis, mas o tipo aceita `0.5`, `0`, `-1`, `Number.MAX_SAFE_INTEGER`. Caller que consulta Sentry com `evaluationWindowHours = 0` faz query degenerada.
Fix: junto com F-CR44-4 (schema Zod), `z.number().int().min(1).max(8760 /* 1 ano */)`.
ADR: ADR-0011.

**F-CR44-13 — `feedUrlForChannel` aceita `base` vazio/malformado (LOW)**.
Ref: `src/index.ts:205-208`.
Contexto: `feedUrlForChannel('', 'beta')` → `'/beta/latest.yml'` (URL relativa silenciosa). `feedUrlForChannel('not a url', 'beta')` → `'not a url/beta/latest.yml'`. Sem validação.
Fix: depende de F-CR44-2 (manter ou apagar). Se mantido, validar via `z.string().url()` ou `new URL(base)` com try/catch retornando Result.
ADR: ADR-0011.

---

## Top 3 (priorizados)

1. **F-CR44-1** — pacote órfão; `UpdateChannel` duplicado em `update-service.ts`. Wire imediato (1 import + 1 type alias) ou deleção. Custo de não-fix: drift garantido a primeira vez que canal mudar.
2. **F-CR44-2** — `feedUrlForChannel` produz URL incompatível com o que electron-builder publica. Quem chamar terá 404. Apagar até existir consumer real.
3. **F-CR44-3** — parsers retornam `null` em vez de `Result<T, ZodError>`. ADR-0011 explícito sobre helpers internos.

## V1 parity

V1 (`G4OS/apps/electron/src/main/auto-update.ts`) usa endpoint tokenizado do viewer (`feed_base_url` minted server-side, com `setFeedURL` em runtime, ADR-0146 não existe em V1). V2 mudou modelo para electron-builder publish block estático (R2). Não há gap funcional — o V2 deliberadamente removeu mint/runtime URL (mais simples, ADR-0146). O pacote `@g4os/release-channels` é V2-only. Nada a portar.

## Catalog drift (ADR-0153)

`zod: catalog:` ✅ correto. `@types/node: catalog:` ✅. `vitest: catalog:` ✅. Sem versões hardcoded. Pacote conforme.

## Não-bugs (verificados)

- TS strict ✅ (typecheck limpo).
- Biome ✅ (lint limpo).
- Sem `console.*`, `any`, `@ts-ignore`, `process.env` ✅.
- Sem `TODO`/`FIXME`/`debugger` ✅.
- `rolloutPercentAt` algoritmo `bestAtHour` está correto (CR-18 F-RC1 fix validado mentalmente: schedule `[{0,100},{48,5}]` desordenada com `elapsedHours=72` → escolhe entry `atHour=48` (max ≤ 72) → 5%, correto).
- Boundary: pacote depende só de `zod` runtime + `@types/node` dev. Sem import de kernel/platform/features ✅.
- Sem leitura de PII, sem URL com secrets logada (sem logger no pacote) ✅.
- Sem timer/listener/watcher → ADR-0012 N/A neste pacote ✅.
- Sem operação async/network → timeout/abort N/A ✅.
- `noEmit: true` + tsup `dts: true` é o padrão usado em `kernel/tsconfig.json` (não é bug).
