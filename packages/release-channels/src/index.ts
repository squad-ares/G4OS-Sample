/**
 * `@g4os/release-channels` — types + helpers puros pro sistema de rollout
 * canary → beta → stable. Sem deps externas além de `zod` + `neverthrow`.
 *
 * Conteúdo: types (`ReleaseChannel`, `PromotionCriteria`, `FeatureFlag`,
 * `RolloutSchedule`), constantes (`RELEASE_CHANNELS`,
 * `DEFAULT_PROMOTION_CRITERIA`, `FEATURE_FLAGS`,
 * `DEFAULT_ROLLOUT_SCHEDULE`) e funções puras (`isFlagEnabled`,
 * `rolloutPercentAt`).
 *
 * Para promover a runtime de produção:
 * 1. Wire `getChannelFromAppMeta()` no main process pra ler do bundle
 *    qual canal o usuário está rodando.
 * 2. UI de switch em settings (`UpdateChannel` componente).
 * 3. Auto-updater consulta `latest.<channel>.yml` em vez de `latest.yml`.
 */

// CR-18 F-RC3: schemas Zod permitem validação runtime quando o auto-updater
// for wired e ler `latest.<channel>.yml` ou similar — input externo sem
// validação seria vetor de corrupção. Hoje os schemas são opt-in (helpers
// puros não exigem), mas `parseFeatureFlags` /
// `parseRolloutSchedule` ficam disponíveis para o caller.
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

export type ReleaseChannel = 'canary' | 'beta' | 'stable';

export const ReleaseChannelSchema = z.enum(['canary', 'beta', 'stable']);

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = Object.freeze([
  'canary',
  'beta',
  'stable',
]);

/**
 * Critério de promoção (canal origem → canal destino) baseado em
 * sinais que vêm do Sentry/PostHog/feedback. Implementação real fica
 * em scripts de promoção que consultam APIs externas.
 */
export interface PromotionCriteria {
  /** Crash-free rate mínima medida em janela de N horas. Default 99.5%. */
  readonly minCrashFreeRate: number;
  /** Janela em horas pra avaliar crash-free. Default 72h pra canary→beta. */
  readonly evaluationWindowHours: number;
  /** Bugs P0 abertos no canal origem que bloqueiam promoção. Default 0. */
  readonly maxOpenP0Bugs: number;
  /** Score mínimo de feedback in-app (0-5). Null = não checar. */
  readonly minUserFeedbackScore: number | null;
}

// F-CR44-4: schema com bounds explícitos para garantir que input externo
// (YAML de config do operador) não gere critérios degenerados (e.g.
// evaluationWindowHours=0 faz query inválida na Sentry).
export const PromotionCriteriaSchema = z.object({
  minCrashFreeRate: z.number().min(0).max(1),
  evaluationWindowHours: z.number().int().min(1).max(8760),
  maxOpenP0Bugs: z.number().int().nonnegative(),
  minUserFeedbackScore: z.number().min(0).max(5).nullable(),
});

export function parsePromotionCriteria(input: unknown): Result<PromotionCriteria, z.ZodError> {
  const parsed = PromotionCriteriaSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(parsed.error);
}

// F-CR44-5: tipo positivo — canary nunca é destino de promoção, mas
// explicitamos quais canais são alvos em vez de usar Exclude<>. Novo canal
// exige decisão explícita aqui.
type PromotionTarget = 'beta' | 'stable';

export const DEFAULT_PROMOTION_CRITERIA: Record<PromotionTarget, PromotionCriteria> = {
  beta: {
    minCrashFreeRate: 0.995,
    evaluationWindowHours: 72,
    maxOpenP0Bugs: 0,
    minUserFeedbackScore: null,
  },
  stable: {
    minCrashFreeRate: 0.998,
    evaluationWindowHours: 168,
    maxOpenP0Bugs: 0,
    minUserFeedbackScore: 4.0,
  },
};

/**
 * Feature flag estagiada por canal. Flag `enabled` se canal atual está
 * em `stages`. Default `false` enquanto não promovida pra nenhum canal
 * (útil pra desenvolvimento atrás de flag).
 */
export interface FeatureFlag {
  readonly key: string;
  readonly description: string;
  readonly stages: readonly ReleaseChannel[];
}

export const FeatureFlagSchema = z.object({
  key: z.string().min(1),
  description: z.string(),
  // F-CR44-8: deduplica stages antes de aceitar — input externo com
  // ['canary', 'canary'] seria aceito silenciosamente.
  stages: z
    .array(ReleaseChannelSchema)
    .transform((s) => Array.from(new Set(s)) as ReleaseChannel[]),
});

// F-CR44-8: rejeita lista com chaves de flag duplicadas — `isFlagEnabled`
// usa first-match-wins e ignora duplicatas silenciosamente.
export const FeatureFlagListSchema = z
  .array(FeatureFlagSchema)
  .refine((xs) => new Set(xs.map((f) => f.key)).size === xs.length, {
    message: 'flag key duplicado na lista',
  });

/**
 * Parse defensivo de uma lista de feature flags vinda de input externo
 * (latest.<channel>.yml, config remoto). Retorna `Result` — caller trata
 * o `ZodError` ou cai no catálogo default.
 *
 * ADR-0011: helpers internos que recebem input externo retornam Result para
 * que o tipo do erro propague na cadeia, sem perder o campo/path do problema.
 */
export function parseFeatureFlags(input: unknown): Result<readonly FeatureFlag[], z.ZodError> {
  const parsed = FeatureFlagListSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(parsed.error);
}

/**
 * Catálogo de flags ativas. Adicionar entry aqui quando feature precisar
 * de gate por canal. Remover entry quando feature for promoted pra todos
 * os canais e estabilizar (limpa o catálogo).
 *
 * F-CR44-10: Object.freeze garante imutabilidade de runtime além do
 * readonly compile-time — evita mutação acidental cross-package.
 */
export const FEATURE_FLAGS: readonly FeatureFlag[] = Object.freeze([
  // Exemplo: nova feature em soak — só canary inicialmente.
  // Object.freeze({
  //   key: 'experimental.semantic.search',
  //   description: 'FTS5 + embeddings ranking — alto custo CPU, validar antes',
  //   stages: Object.freeze(['canary'] as ReleaseChannel[]),
  // }),
]);

export function isFlagEnabled(flagKey: string, channel: ReleaseChannel): boolean {
  const flag = FEATURE_FLAGS.find((f) => f.key === flagKey);
  return flag ? flag.stages.includes(channel) : false;
}

/**
 * Cronograma de rollout gradual no canal stable. % usuários que recebem
 * a versão por dia. Usar `userBucket = hash(userId) % 100` no
 * auto-updater pra decidir se aplica.
 *
 * Default: 5% no dia 0 → 25% dia 2 → 50% dia 4 → 100% dia 7.
 */
export interface RolloutSchedule {
  readonly version: string;
  readonly entries: readonly RolloutEntry[];
}

export interface RolloutEntry {
  readonly atHour: number;
  readonly percent: number;
}

export const RolloutEntrySchema = z.object({
  atHour: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});

export const RolloutScheduleSchema = z.object({
  version: z.string().min(1),
  entries: z.array(RolloutEntrySchema),
});

/**
 * Parse defensivo de schedule de rollout. Retorna `Result` — caller trata
 * o `ZodError` ou cai no schedule default.
 *
 * ADR-0011: helpers internos que recebem input externo retornam Result.
 */
export function parseRolloutSchedule(input: unknown): Result<RolloutSchedule, z.ZodError> {
  const parsed = RolloutScheduleSchema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(parsed.error);
}

export const DEFAULT_ROLLOUT_SCHEDULE: readonly RolloutEntry[] = Object.freeze([
  { atHour: 0, percent: 5 },
  { atHour: 48, percent: 25 },
  { atHour: 96, percent: 50 },
  { atHour: 168, percent: 100 },
]);

// F-CR44-6: constante nomeada substitui magic number inline.
const MS_PER_HOUR = 3_600_000 as const;

/**
 * Percent permitido em `now` dado uma schedule. `releaseStartedAt` e `now`
 * são epochs em ms. Retorna 0 antes do início, 100 depois do último entry.
 *
 * Contrato: `releaseStartedAt > now` ⇒ 0 (versão ainda não iniciada).
 *
 * Schedule pode chegar desordenada (input externo via
 * `parseRolloutSchedule` — Zod schema não enforça ordem). Em vez de exigir
 * sort do caller, trackeamos o entry com `atHour` máximo que ainda satisfaz
 * `atHour <= elapsedHours` em uma passada O(n). Iteração ingênua que só
 * sobrescreve `result` pegava o último entry da iteração quando schedule
 * não estava sorted, devolvendo percent errado (CR-18 F-RC1 regression fix).
 *
 * F-CR44-6: entries com `atHour` negativo ou `percent` fora de [0,100]
 * violam invariante — runtime protege lançando em casos anômalos.
 * Invariantes de input são bugs do caller, não erros esperados (ADR-0011).
 */
export function rolloutPercentAt(
  schedule: readonly RolloutEntry[],
  releaseStartedAt: number,
  now: number,
): number {
  if (schedule.length === 0) return 0;
  const elapsedHours = (now - releaseStartedAt) / MS_PER_HOUR;
  if (elapsedHours < 0) return 0;
  let result = 0;
  let bestAtHour = -1;
  for (const entry of schedule) {
    // Invariante: caller não deve passar entries com valores fora do range
    // — lançar é a resposta correta para um bug de programação (ADR-0011).
    if (entry.atHour < 0 || entry.percent < 0 || entry.percent > 100) {
      throw new Error(
        `rolloutPercentAt: entry inválida {atHour=${entry.atHour}, percent=${entry.percent}}`,
      );
    }
    if (entry.atHour <= elapsedHours && entry.atHour > bestAtHour) {
      result = entry.percent;
      bestAtHour = entry.atHour;
    }
  }
  return result;
}
