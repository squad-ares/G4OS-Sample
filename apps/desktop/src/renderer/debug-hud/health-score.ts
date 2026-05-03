/**
 * Cálculo puro do "Health Score" do sistema (0-100).
 *
 * Heurística: começa em 100 e desconta por insight ativo, ponderado
 * por severidade. Score serve como resposta de 1-segundo pra "tudo
 * OK?" — usuário leigo lê uma cor + número, sem precisar interpretar
 * 5 cards.
 *
 * Calibração inicial: critical descontа 30 (3 críticos = 10/100, já é
 * "péssimo"), warn 10, info 3. Ajustar conforme feedback real.
 */

import type { TranslationKey } from '@g4os/ui';
import type { Insight } from './insights.ts';

export type HealthScoreLabel = 'saudavel' | 'atencao' | 'critico';

export interface HealthScore {
  readonly value: number;
  readonly label: HealthScoreLabel;
}

const PENALTY: Record<Insight['severity'], number> = {
  critical: 30,
  warn: 10,
  info: 3,
};

const SAUDAVEL_THRESHOLD = 75;
const ATENCAO_THRESHOLD = 40;

export function computeHealthScore(insights: readonly Insight[]): HealthScore {
  let score = 100;
  for (const insight of insights) {
    score -= PENALTY[insight.severity];
  }
  const clamped = Math.max(0, Math.min(100, score));
  const label: HealthScoreLabel =
    clamped >= SAUDAVEL_THRESHOLD
      ? 'saudavel'
      : clamped >= ATENCAO_THRESHOLD
        ? 'atencao'
        : 'critico';
  return { value: clamped, label };
}

export const HEALTH_LABEL_KEY: Record<HealthScoreLabel, TranslationKey> = {
  saudavel: 'debugHud.healthLabel.healthy',
  atencao: 'debugHud.healthLabel.attention',
  critico: 'debugHud.healthLabel.critical',
};
