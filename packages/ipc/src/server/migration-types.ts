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

export interface MigrationStepReportView {
  readonly kind: MigrationStepKindView;
  readonly itemsMigrated: number;
  readonly itemsSkipped: number;
  readonly bytesProcessed: number;
  readonly nonFatalWarnings: readonly string[];
}

export interface MigrationReportView {
  readonly source: string;
  readonly target: string;
  readonly v1Version: string | null;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly stepResults: readonly MigrationStepReportView[];
  readonly backupPath: string | null;
  readonly success: boolean;
}

export interface MigrationExecuteInputView {
  readonly source?: V1InstallView;
  readonly target?: string;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly v1MasterKey?: string;
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
  /**
   * Executa a migração completa: backup V1 → run steps → rollback em falha →
   * `.migration-done` marker. Idempotente (skipa marker existente sem `force`).
   * Em `dryRun`, valida sem escrever (testa decryption de creds, parsing de
   * workspaces.json/sessions.jsonl, etc.) — útil pro UI Wizard antes do commit.
   */
  execute(input: MigrationExecuteInputView): Promise<Result<MigrationReportView, AppError>>;
}
