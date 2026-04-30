/**
 * Contrato de step de migração — cada step recebe paths source/target +
 * progress callback e retorna stats de execução.
 *
 * Mantemos contrato puro (sem dependência de Electron, SDK, etc.) pra
 * que steps possam ser testados isoladamente com tmpdir + fixtures.
 *
 * `StepOptions` carrega dependências externas opcionais (vault, masterKey,
 * workspaceWriter). Steps que precisam delas e não recebem retornam
 * `Result.err` com mensagem clara — caller (CLI/wizard) decide o que fazer.
 */

import type { CredentialVault } from '@g4os/credentials';
import type { AppError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';
import type { MigrationStep, ProgressCallback } from '../types.ts';

/**
 * Hook injetável para persistir um workspace V2 lido do V1. Mantém o
 * step desacoplado de SQLite/Drizzle/Electron — o caller (main service
 * ou test fixture) provê a impl real.
 */
export interface V2WorkspaceWriter {
  exists(id: string): Promise<boolean>;
  create(input: V2WorkspaceInput): Promise<void>;
}

export interface V2WorkspaceInput {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly color?: string;
  readonly description?: string;
  readonly category?: string;
}

export interface StepOptions {
  /** Master key V1 (PBKDF2) — necessário para `migrate-credentials`. */
  readonly v1MasterKey?: string;
  /** Vault V2 destino — necessário para `migrate-credentials`. */
  readonly vault?: CredentialVault;
  /** Writer V2 — necessário para `migrate-workspaces` em modo write. */
  readonly workspaceWriter?: V2WorkspaceWriter;
}

export interface StepContext {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly step: MigrationStep;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly onProgress: ProgressCallback;
  readonly dryRun: boolean;
  readonly options: StepOptions;
}

export interface StepResult {
  readonly itemsMigrated: number;
  readonly itemsSkipped: number;
  readonly bytesProcessed: number;
  readonly nonFatalWarnings: readonly string[];
}

export type StepRunner = (ctx: StepContext) => Promise<Result<StepResult, AppError>>;
