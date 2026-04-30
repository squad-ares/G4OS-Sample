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

import type { AppError } from '@g4os/kernel/errors';

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

/** Tipos discriminados de step — cada um sabe o seu próprio formato V1. */
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
  | 'already_migrated';

export interface MigrationError extends AppError {
  readonly migrationCode: MigrationErrorCode;
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
  readonly success: boolean;
}
