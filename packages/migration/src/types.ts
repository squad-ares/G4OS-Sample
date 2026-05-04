/**
 * Tipos compartilhados do módulo de migração V1 → V2.
 *
 * V1 vivia em `~/.g4os` (ou `~/.g4os-public`) e usava JSON files plain.
 * V2 vive em paths `env-paths` (ex: `~/Library/Application Support/g4os`
 * no macOS, `%APPDATA%\g4os` no Windows, `~/.local/share/g4os` no Linux)
 * e usa SQLite + JSONL append-only.
 *
 * O migrator é **não-destrutivo**: cria backup do V1 antes de tocar
 * qualquer coisa, escreve V2 em paralelo, e apaga V1 só após verificação
 * (ou nunca, se o usuário preferir manter).
 */

import { AppError, ErrorCode } from '@g4os/kernel/errors';

/** Diretórios candidatos onde V1 pode estar instalado (em `homedir()`). */
export const V1_CANDIDATE_DIRS = ['.g4os', '.g4os-public'] as const;
export type V1Flavor = 'internal' | 'public';

export interface V1Install {
  /** Caminho absoluto do diretório raiz V1 (ex: `/Users/x/.g4os`). */
  readonly path: string;
  /** Versão V1 detectada (lida de `config.json`). `null` se não conseguir. */
  readonly version: string | null;
  /** Flavor inferido pelo nome do diretório. */
  readonly flavor: V1Flavor;
}

/**
 * Tipos discriminados de step — cada um sabe o seu próprio formato V1.
 *
 * F-CR40-2 (SKIP-ADR): `projects` está AUSENTE deste enum. ADR-0133 delega
 * o re-discovery de projetos V1 para `ProjectsService.discoverLegacyProjects`
 * no renderer (pós-migração), que varre 3 candidatos e usa sentinel
 * `.legacy-import-done`. Contudo, projetos em `~/.g4os/workspaces/<wid>/projects/`
 * fora do `workingDirectory` configurado não são cobertos por esse discovery.
 * Decisão: deferred ao discovery pós-migração do ADR-0133 por ora.
 *
 * TODO: ADR needed for projects/ migration — decidir se adicionamos step
 * `projects` que copia `<v1>/workspaces/<wid>/projects/` para
 * `<v2 workspace root>/<wid>/projects/`, ou se formalizamos via ADR que
 * o discovery do ADR-0133 é suficiente (e documenta o gap de projetos
 * fora do workingDirectory).
 */
// TODO(ADR-needed): projects/ migration step missing — see CR-40 F-CR40-2
export type MigrationStepKind =
  | 'config'
  | 'credentials'
  | 'workspaces'
  | 'sessions'
  | 'sources'
  | 'skills';

export interface MigrationStep {
  readonly kind: MigrationStepKind;
  readonly description: string;
  /** Itens a migrar (workspaces, sessions, etc.). 0 = step desabilitado. */
  readonly count: number;
  /** Bytes estimados a copiar/converter. Aproximação. */
  readonly estimatedBytes: number;
}

export interface MigrationPlan {
  readonly source: V1Install;
  /** Caminho V2 destino (resolvido por `getAppPaths()`). */
  readonly target: string;
  readonly steps: readonly MigrationStep[];
  /** Soma dos `estimatedBytes` de todos os steps. */
  readonly estimatedSize: number;
  /** Avisos não-bloqueantes (ex: cred file ausente, workspace órfão). */
  readonly warnings: readonly string[];
  /** Marker idempotência: se já há `.migration-done` no V2, plan vem com esse flag. */
  readonly alreadyMigrated: boolean;
}

/** Códigos de erro específicos de migração. Mapeiam pra exit codes do CLI. */
export type MigrationErrorCode =
  | 'no_v1_install_found'
  | 'v1_corrupted'
  | 'backup_failed'
  | 'step_failed'
  | 'rollback_failed'
  | 'already_migrated'
  | 'lock_failed'
  | 'invalid_source'
  | 'partial_failure';

export interface MigrationError extends AppError {
  readonly migrationCode: MigrationErrorCode;
}

/** Mapeamento de MigrationErrorCode → ErrorCode para telemetria e UI. F-CR40-3. */
const MIGRATION_CODE_TO_ERROR_CODE: Record<MigrationErrorCode, ErrorCode> = {
  no_v1_install_found: ErrorCode.MIGRATION_INVALID_SOURCE,
  v1_corrupted: ErrorCode.MIGRATION_V1_CORRUPTED,
  backup_failed: ErrorCode.MIGRATION_BACKUP_FAILED,
  step_failed: ErrorCode.MIGRATION_STEP_FAILED,
  rollback_failed: ErrorCode.MIGRATION_ROLLBACK_FAILED,
  already_migrated: ErrorCode.MIGRATION_ALREADY_DONE,
  lock_failed: ErrorCode.MIGRATION_LOCK_FAILED,
  invalid_source: ErrorCode.MIGRATION_INVALID_SOURCE,
  partial_failure: ErrorCode.MIGRATION_PARTIAL_FAILURE,
};

/**
 * Factory para erros de migração tipados. F-CR40-3: substitui todas as
 * chamadas `new AppError({ code: UNKNOWN_ERROR })` no pacote por códigos
 * específicos, permitindo que o CLI e a UI Wizard diferenciem por tipo
 * (lock, backup, step, rollback, já migrado, etc.).
 */
export function migrationError(opts: {
  readonly migrationCode: MigrationErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}): MigrationError {
  const code = MIGRATION_CODE_TO_ERROR_CODE[opts.migrationCode];
  // exactOptionalPropertyTypes: não passa cause/context se undefined —
  // usa spread condicional para não incluir a chave.
  const base = new AppError({
    code,
    message: opts.message,
    ...(opts.cause instanceof Error ? { cause: opts.cause } : {}),
    ...(opts.context === undefined ? {} : { context: opts.context }),
  });
  return Object.assign(base, { migrationCode: opts.migrationCode }) as MigrationError;
}

/** Callback de progresso emitido durante `executor.execute`. */
export interface ProgressEvent {
  readonly stepKind: MigrationStepKind;
  readonly stepIndex: number;
  readonly stepCount: number;
  /** 0..1 — fração concluída do step atual. */
  readonly stepProgress: number;
  readonly message: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

/** Resultado final da execução — usado pro report pós-migração. */
export interface MigrationReport {
  readonly source: string;
  readonly target: string;
  readonly v1Version: string | null;
  readonly startedAt: number;
  readonly finishedAt: number;
  /** Stats por step (itens migrados, bytes, erros não-fatais). */
  readonly stepResults: ReadonlyArray<{
    readonly kind: MigrationStepKind;
    readonly itemsMigrated: number;
    readonly itemsSkipped: number;
    readonly bytesProcessed: number;
    readonly nonFatalWarnings: readonly string[];
  }>;
  readonly backupPath: string | null;
  /** `true` se todos os steps concluíram sem err fatal. */
  readonly success: boolean;
  /**
   * F-CR40-17: `true` se algum step teve skipRatio > 10% (ex: 80/100
   * workspaces malformados → sucesso técnico mas 80% dos dados não migraram).
   * UI Wizard renderiza ícone amarelo em vez de verde quando este flag é true.
   */
  readonly partialSuccess: boolean;
  /**
   * Steps com skipRatio > 10%. Vazio quando `partialSuccess = false`.
   * UI pode listar quais steps tiveram alta taxa de skip com contexto.
   */
  readonly degradedSteps: ReadonlyArray<{
    readonly kind: MigrationStepKind;
    readonly skipRatio: number;
  }>;
}
