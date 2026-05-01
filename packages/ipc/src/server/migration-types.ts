/**
 * Migration V1 → V2 — espelha shape de `@g4os/migration` mas inline pra
 * manter `@g4os/ipc` sem dep do package de migration. Como interfaces TS
 * são structural, o impl em main retorna types do package e satisfaz o
 * contrato sem cast.
 */

import type { AppError, Result } from '@g4os/kernel/errors';

export type V1FlavorView = 'internal' | 'public';

export interface V1InstallView {
  readonly path: string;
  readonly version: string | null;
  readonly flavor: V1FlavorView;
}

export type MigrationStepKindView =
  | 'config'
  | 'credentials'
  | 'workspaces'
  | 'sessions'
  | 'sources'
  | 'skills';

export interface MigrationStepView {
  readonly kind: MigrationStepKindView;
  readonly description: string;
  readonly count: number;
  readonly estimatedBytes: number;
}

export interface MigrationPlanView {
  readonly source: V1InstallView;
  readonly target: string;
  readonly steps: readonly MigrationStepView[];
  readonly estimatedSize: number;
  readonly warnings: readonly string[];
  readonly alreadyMigrated: boolean;
}

export interface MigrationService {
  /** Procura V1 install em `homedir()` candidatos. Retorna null se não achar. */
  detect(): Promise<Result<V1InstallView | null, AppError>>;
  /**
   * Constrói o plano sem tocar V2 (read-only). Aceita override de source/target
   * pra dev/CLI. Em produção, `detect()` define a source.
   */
  plan(input: {
    readonly source?: V1InstallView;
    readonly target?: string;
  }): Promise<Result<MigrationPlanView, AppError>>;
}
