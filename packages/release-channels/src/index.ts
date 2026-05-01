/**
 * `@g4os/release-channels` — types + helpers puros pro sistema de rollout
 * canary → beta → stable. Sem deps externas além de `@types/node` em
 * devDeps.
 *
 * Conteúdo: types (`ReleaseChannel`, `PromotionCriteria`, `FeatureFlag`,
 * `RolloutSchedule`), constantes (`RELEASE_CHANNELS`,
 * `DEFAULT_PROMOTION_CRITERIA`, `FEATURE_FLAGS`,
 * `DEFAULT_ROLLOUT_SCHEDULE`) e funções puras (`isFlagEnabled`,
 * `rolloutPercentAt`, `feedUrlForChannel`).
 *
 * Decisões operacionais (quando promover, quanto rolar gradualmente)
 * vivem nos scripts em `tools/release/` e no playbook em
 * `docs/release/playbook.md`. Os helpers daqui são consumidos por esses
 * scripts + futuro wire do auto-updater.
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
import { z } from 'zod';

export type ReleaseChannel = 'canary' | 'beta' | 'stable';

export const ReleaseChannelSchema = z.enum(['canary', 'beta', 'stable']);

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = ['canary', 'beta', 'stable'];

/**
 * Critério de promoção (canal origem → canal destino) baseado em
 * sinais que vêm do Sentry/PostHog/feedback. Implementação real fica
 * em `tools/release/promote.ts` que consulta APIs externas.
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

export const DEFAULT_PROMOTION_CRITERIA: Record<
  Exclude<ReleaseChannel, 'canary'>,
  PromotionCriteria
> = {
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
  stages: z.array(ReleaseChannelSchema),
});

export const FeatureFlagListSchema = z.array(FeatureFlagSchema);

/**
 * Parse defensivo de uma lista de feature flags vinda de input externo
 * (latest.<channel>.yml, config remoto). Retorna `null` em failure —
 * caller decide se cai no `FEATURE_FLAGS` default ou propaga erro.
 */
export function parseFeatureFlags(input: unknown): readonly FeatureFlag[] | null {
  const parsed = FeatureFlagListSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/**
 * Catálogo de flags ativas. Adicionar entry aqui quando feature precisar
 * de gate por canal. Remover entry quando feature for promoted pra todos
 * os canais e estabilizar (limpa o catálogo).
 */
export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  // Exemplo: nova feature em soak — só canary inicialmente.
  // {
  //   key: 'experimental.semantic.search',
  //   description: 'FTS5 + embeddings ranking — alto custo CPU, validar antes',
  //   stages: ['canary'],
  // },
];

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
 * Parse defensivo de schedule de rollout. Retorna `null` em failure.
 */
export function parseRolloutSchedule(input: unknown): RolloutSchedule | null {
  const parsed = RolloutScheduleSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export const DEFAULT_ROLLOUT_SCHEDULE: readonly RolloutEntry[] = [
  { atHour: 0, percent: 5 },
  { atHour: 48, percent: 25 },
  { atHour: 96, percent: 50 },
  { atHour: 168, percent: 100 },
];

/**
 * Percent permitido em `now` dado uma schedule. `releaseStartedAt` e `now`
 * são epochs em ms. Retorna 0 antes do início, 100 depois do último entry.
 */
export function rolloutPercentAt(
  schedule: readonly RolloutEntry[],
  releaseStartedAt: number,
  now: number,
): number {
  if (schedule.length === 0) return 0;
  const elapsedHours = (now - releaseStartedAt) / 3_600_000;
  if (elapsedHours < 0) return 0;
  let result = 0;
  for (const entry of schedule) {
    if (entry.atHour <= elapsedHours) result = entry.percent;
  }
  return result;
}

export interface ChannelMeta {
  readonly channel: ReleaseChannel;
  readonly feedUrl: string;
}

/**
 * Resolve URL do feed por canal. Convenção:
 * `s3://g4os-releases/<channel>/latest.yml`. Customizar via env override
 * em outro lugar — aqui só a default.
 */
export function feedUrlForChannel(base: string, channel: ReleaseChannel): string {
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/${channel}/latest.yml`;
}
