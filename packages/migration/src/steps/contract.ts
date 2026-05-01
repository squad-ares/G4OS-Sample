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
import type { SourceKind } from '@g4os/kernel/schemas';
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

/**
 * Hook injetável para persistir uma source V2 num workspace. V2 mantém
 * `sources.json` por workspace (per-workspace store), por isso a
 * granularidade é (workspaceId, slug). `id`, `status`, `createdAt`,
 * `updatedAt` são responsabilidade do writer (vêm da camada de service
 * que tem acesso ao SQLite + clock).
 */
export interface V2SourceWriter {
  exists(workspaceId: string, slug: string): Promise<boolean>;
  add(input: V2SourceInput): Promise<void>;
}

export interface V2SourceInput {
  readonly workspaceId: string;
  readonly slug: string;
  readonly kind: SourceKind;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly credentialKey?: string;
  readonly description?: string;
}

/**
 * Hook injetável para persistir sessões V2. Cada sessão tem:
 * 1) registro no SQLite (`sessions` table, via `createSession`)
 * 2) sequência de eventos no JSONL (via `appendEvent`)
 *
 * Caller (main service) costura `SessionsRepository.create()` +
 * `SessionEventStore.append()` + `applyEvent()` na impl.
 */
export interface V2SessionWriter {
  existsSession(workspaceId: string, sessionId: string): Promise<boolean>;
  createSession(input: V2SessionMetadata): Promise<void>;
  /**
   * Anexa um evento já validado pelo Zod schema V2 (`SessionEventSchema`).
   * Migrate-sessions envia só eventos que passaram pela validação.
   */
  appendEvent(sessionId: string, event: unknown): Promise<void>;
}

export interface V2SessionMetadata {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly provider?: string;
  readonly modelId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StepOptions {
  /** Master key V1 (PBKDF2) — necessário para `migrate-credentials`. */
  readonly v1MasterKey?: string;
  /** Vault V2 destino — necessário para `migrate-credentials`. */
  readonly vault?: CredentialVault;
  /** Writer V2 — necessário para `migrate-workspaces` em modo write. */
  readonly workspaceWriter?: V2WorkspaceWriter;
  /** Writer V2 — necessário para `migrate-sources` em modo write. */
  readonly sourceWriter?: V2SourceWriter;
  /** IDs de workspaces V2 conhecidos (alvo da distribuição de sources globais V1). */
  readonly knownWorkspaceIds?: readonly string[];
  /** Writer V2 — necessário para `migrate-sessions` em modo write. */
  readonly sessionWriter?: V2SessionWriter;
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
