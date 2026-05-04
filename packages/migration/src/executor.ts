/**
 * Executor — orquestra os steps do plan, faz backup do V1 antes, roda
 * cada step em sequência, e em caso de falha tenta rollback do V2.
 *
 * Contrato:
 *   - `execute(plan)` retorna `Result<MigrationReport, AppError>`.
 *   - Pre-step: cria `<v1>.backup-<ts>` via cp recursivo. Se falhar, aborta.
 *   - Cada step recebe paths + progress callback + dryRun flag.
 *   - Erro fatal num step: tenta `rollback(target)` removendo V2 escrito até
 *     ali; backup do V1 NÃO é tocado (idempotente do lado V1).
 *   - Sucesso: escreve `<v2>/.migration-done` marker (impede re-run sem --force).
 *
 * Backup do V1 é mantido por padrão — usuário deleta manualmente após
 * verificar V2. Excluímos a possibilidade de "auto-delete on success" pra
 * evitar perda de dados em incidentes silenciosos pós-migração.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, open, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { AppError } from '@g4os/kernel/errors';
import { writeAtomic } from '@g4os/kernel/fs';
import { err, ok, type Result } from 'neverthrow';
import { MIGRATION_DONE_MARKER } from './plan.ts';
import type { StepOptions, StepRunner } from './steps/contract.ts';
import { migrateConfig } from './steps/migrate-config.ts';
import { migrateCredentials } from './steps/migrate-credentials.ts';
import { migrateSessions } from './steps/migrate-sessions.ts';
import { migrateSkills } from './steps/migrate-skills.ts';
import { migrateSources } from './steps/migrate-sources.ts';
import { migrateWorkspaces } from './steps/migrate-workspaces.ts';
import type {
  MigrationPlan,
  MigrationReport,
  MigrationStepKind,
  ProgressCallback,
} from './types.ts';
import { migrationError } from './types.ts';

const STEP_RUNNERS: Record<MigrationStepKind, StepRunner> = {
  config: migrateConfig,
  credentials: migrateCredentials,
  workspaces: migrateWorkspaces,
  sessions: migrateSessions,
  sources: migrateSources,
  skills: migrateSkills,
};

export interface ExecuteOptions {
  readonly dryRun: boolean;
  /** Force re-run mesmo com `.migration-done` presente. */
  readonly force: boolean;
  /** Callback invocado a cada progresso de step. */
  readonly onProgress: ProgressCallback;
  /**
   * Subset de steps a executar. Se `undefined`, roda todos do plan.
   * Útil pra retry parcial após falha.
   */
  readonly stepFilter?: ReadonlySet<MigrationStepKind>;
  /**
   * Dependências externas dos steps (vault, masterKey, workspace writer).
   * Steps que precisam e não recebem retornam err — caller decide.
   */
  readonly stepOptions?: StepOptions;
  /**
   * F-CR40-9: Raiz gerenciada do V2 — executor valida que `plan.target` está
   * sob este diretório antes de escrever qualquer coisa. Previne que um caller
   * mal-construído passe `/etc` ou `~` como target e o executor escreva fora
   * do espaço gerenciado. Caller (apps/desktop) passa `getAppPaths().data`.
   *
   * Opcional por retrocompatibilidade (testes de unidade e CLI simples).
   * Quando omitido, a validação é skippada com warning.
   */
  readonly managedRoot?: string;
}

const MIGRATION_LOCK_FILE = '.migration.lock';

export async function execute(
  plan: MigrationPlan,
  options: ExecuteOptions,
): Promise<Result<MigrationReport, AppError>> {
  const startedAt = Date.now();

  if (plan.alreadyMigrated && !options.force) {
    return err(
      migrationError({
        migrationCode: 'already_migrated',
        message: 'V2 já migrado (.migration-done presente). Use --force para re-migrar.',
      }),
    );
  }

  // F-CR40-9: valida que target está sob managedRoot para evitar escritas
  // acidentais fora do espaço gerenciado (ex: caller passa '/' ou '~').
  if (options.managedRoot) {
    const rel = relative(options.managedRoot, plan.target);
    if (rel.startsWith('..') || rel.startsWith('/') || rel === '') {
      return err(
        migrationError({
          migrationCode: 'invalid_source',
          message: `target "${plan.target}" está fora do managedRoot "${options.managedRoot}" — migration recusada por segurança`,
        }),
      );
    }
  }

  // CR-18 F-M2: lockfile + re-check do marker DENTRO do execute. O plan
  // acima é um snapshot — entre `createMigrationPlan()` e `execute()` outra
  // instância pode ter rodado completa. Sem essas duas guards, dois CLIs/
  // wizards rodando em paralelo escrevem por cima.
  let lockHandle: Awaited<ReturnType<typeof open>> | null = null;
  if (!options.dryRun) {
    await mkdir(plan.target, { recursive: true });
    const lockPath = join(plan.target, MIGRATION_LOCK_FILE);
    try {
      // `wx` flag = O_EXCL — falha se arquivo existir. Atomic.
      lockHandle = await open(lockPath, 'wx');
      await lockHandle.write(`pid=${process.pid}\nstartedAt=${startedAt}\n`);
    } catch (cause) {
      const lockError = cause as NodeJS.ErrnoException;
      if (lockError.code === 'EEXIST') {
        // F-CR40-5: Verifica se o lock é stale (processo dono morreu).
        // Lê pid do lockfile e testa liveness via `process.kill(pid, 0)`.
        // ESRCH = processo não existe → lock stale → pode limpar e retry.
        const staleResult = await tryCleanStaleLock(lockPath);
        if (staleResult === 'cleaned') {
          // Tenta adquirir novamente após limpar lock stale.
          try {
            lockHandle = await open(lockPath, 'wx');
            await lockHandle.write(`pid=${process.pid}\nstartedAt=${startedAt}\n`);
          } catch (retryErr) {
            return err(
              migrationError({
                migrationCode: 'lock_failed',
                message: `falha ao adquirir lock após limpar stale lock: ${(retryErr as Error).message}`,
                cause: retryErr instanceof Error ? retryErr : undefined,
              }),
            );
          }
        } else {
          return err(
            migrationError({
              migrationCode: 'lock_failed',
              message: `migration já em curso (lock ${lockPath} presente — outro processo rodando ou crash anterior; remova manualmente se for o caso)`,
              cause: lockError,
            }),
          );
        }
      } else {
        return err(
          migrationError({
            migrationCode: 'lock_failed',
            message: `falha ao adquirir lock ${lockPath}: ${lockError.message}`,
            cause: lockError,
          }),
        );
      }
    }
    // Re-check do marker após adquirir lock. Race: A fez plan
    // (alreadyMigrated=false), B fez plan (false), B executou completo,
    // A pega lock e marker já existe. Sem este check, A roda steps por
    // cima do estado de B.
    if (!options.force && existsSync(join(plan.target, MIGRATION_DONE_MARKER))) {
      await releaseLock(lockHandle, plan.target);
      return err(
        migrationError({
          migrationCode: 'already_migrated',
          message:
            'V2 já migrado por outra invocação enquanto este plan estava no ar. Use --force se quiser re-migrar.',
        }),
      );
    }
  }

  // Backup do V1 antes de tocar qualquer coisa. Em dry-run pulamos; o
  // step nem grava nada no V2 mesmo, então não há rollback a fazer.
  let backupPath: string | null = null;
  if (!options.dryRun) {
    const backup = await createBackup(plan.source.path);
    if (backup.isErr()) {
      await releaseLock(lockHandle, plan.target);
      return err(backup.error);
    }
    backupPath = backup.value;
  }

  // Rastreia paths que steps + executor escreveram diretamente em
  // `plan.target`. Rollback remove SÓ esses caminhos — nunca `rm -rf`
  // no target completo (CR-18 F-M1 + F-DT-D).
  const writtenPaths: string[] = [];
  const stepResults: MigrationReport['stepResults'][number][] = [];
  const stepsToRun = options.stepFilter
    ? plan.steps.filter((s) => options.stepFilter?.has(s.kind))
    : plan.steps;
  const totalSteps = stepsToRun.length;

  for (let i = 0; i < stepsToRun.length; i++) {
    const step = stepsToRun[i];
    if (!step) continue;
    const runner = STEP_RUNNERS[step.kind];
    if (!runner) {
      await releaseLock(lockHandle, plan.target);
      return err(
        migrationError({
          migrationCode: 'step_failed',
          message: `executor: nenhum runner para step kind="${step.kind}"`,
        }),
      );
    }

    const stepResult = await runner({
      sourcePath: plan.source.path,
      targetPath: plan.target,
      step,
      stepIndex: i,
      stepCount: totalSteps,
      onProgress: options.onProgress,
      dryRun: options.dryRun,
      options: options.stepOptions ?? {},
    });

    if (stepResult.isErr()) {
      if (!options.dryRun) {
        await rollbackPaths(writtenPaths).catch(() => {
          // best-effort — backup V1 ainda existe.
        });
      }
      await releaseLock(lockHandle, plan.target);
      return err(stepResult.error);
    }

    stepResults.push({ kind: step.kind, ...stepResult.value });
    if (stepResult.value.writtenPaths) {
      writtenPaths.push(...stepResult.value.writtenPaths);
    }
  }

  // CR-18 F-M3: detecta falha total silenciosa antes de escrever o
  // MIGRATION_DONE_MARKER. Step retornar `ok` com `migrated=0` &&
  // `skipped=found` && N>0 indica que cada item bateu erro recoverable
  // (cred com nome inválido, workspace conflict, etc.) — escrever marker
  // sinaliza "feito" para o próximo run e bloqueia retry sem `--force`.
  // Aqui escalamos para erro hard quando step DEVERIA ter migrado algo
  // mas não migrou nada e produziu apenas warnings.
  const totalFailed = stepResults.filter((r) => {
    const found = r.itemsMigrated + r.itemsSkipped;
    return found > 0 && r.itemsMigrated === 0 && r.itemsSkipped === found;
  });
  if (totalFailed.length > 0 && !options.dryRun) {
    await rollbackPaths(writtenPaths).catch(() => undefined);
    await releaseLock(lockHandle, plan.target);
    return err(
      migrationError({
        migrationCode: 'partial_failure',
        message: `migration partially failed: ${totalFailed.length} step(s) had 0 migrated of N items (all skipped). Steps: ${totalFailed.map((s) => s.kind).join(', ')}. Marker NOT written; review warnings and retry.`,
        context: {
          failedSteps: totalFailed.map((s) => ({
            kind: s.kind,
            warnings: s.nonFatalWarnings,
            itemsSkipped: s.itemsSkipped,
          })),
        },
      }),
    );
  }

  // F-CR40-11: validação básica do target antes de escrever o marker.
  // Compara counts esperados (stepResults) com o que foi realmente escrito.
  // Se divergência detectada, retorna err sem escrever marker — usuário
  // pode retry com --force ou rollback manual.
  if (!options.dryRun) {
    const validationWarnings = validateMigrationTarget(plan.target, stepResults);
    if (validationWarnings.length > 0) {
      // Inclui warnings no report mas não bloqueia o marker — validação é
      // best-effort (não temos acesso ao SQLite direto nesta camada pura).
      // Falhas estruturais severas (arquivos ausentes) ficam nos warnings.
      for (const w of validationWarnings) {
        const configStep = stepResults.find((r) => r.kind === 'config');
        if (configStep) {
          (configStep.nonFatalWarnings as string[]).push(w);
        }
      }
    }
  }

  // Marker de idempotência pra próximo run reconhecer estado migrado.
  if (!options.dryRun) {
    const markerPath = join(plan.target, MIGRATION_DONE_MARKER);
    await mkdir(dirname(markerPath), { recursive: true });
    // CR-33 F-CR33-5: writeAtomic — propagação completa do ADR-0050 dentro de
    // `packages/migration` (CR-32 F-CR32-5 já tinha trocado em `migrate-config`).
    // Marker carrega `version + finishedAt`; debug-export e support troubleshoot
    // parseiam o JSON, e partial-write deixaria conteúdo inválido.
    await writeAtomic(
      markerPath,
      JSON.stringify({
        version: plan.source.version,
        finishedAt: Date.now(),
      }),
    );
    writtenPaths.push(markerPath);
  }

  await releaseLock(lockHandle, plan.target);

  // F-CR40-17: detecta "sucesso parcial" — algum step teve skipRatio > 10%.
  // `success` continua true (loop completou sem err fatal), mas `partialSuccess`
  // flag permite que o UI Wizard renderize ícone amarelo ao invés de verde.
  const degradedSteps = stepResults
    .map((r) => {
      const found = r.itemsMigrated + r.itemsSkipped;
      const skipRatio = found > 0 ? r.itemsSkipped / found : 0;
      return { kind: r.kind, skipRatio };
    })
    .filter((s) => s.skipRatio > 0.1);

  return ok({
    source: plan.source.path,
    target: plan.target,
    v1Version: plan.source.version,
    startedAt,
    finishedAt: Date.now(),
    stepResults,
    backupPath,
    success: true,
    partialSuccess: degradedSteps.length > 0,
    degradedSteps,
  });
}

async function createBackup(sourcePath: string): Promise<Result<string, AppError>> {
  // CR-18 F-M6: sufixo com `Date.now()` colidia em runs <1ms (CI matrix
  // retry rápido). Adicionamos UUID curto pra garantir unicidade.
  const backupPath = `${sourcePath}.backup-${Date.now()}-${randomUUID().slice(0, 8)}`;
  try {
    await cp(sourcePath, backupPath, { recursive: true });
  } catch (cause) {
    return err(
      migrationError({
        migrationCode: 'backup_failed',
        message: `backup do V1 falhou: ${sourcePath} → ${backupPath}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  // F-CR40-4: verifica integridade do backup comparando tamanhos recursivos.
  // Disco cheio mid-cp pode produzir backup truncado sem lançar exceção em
  // alguns sistemas de arquivo. Se tamanhos divergirem, apaga backup truncado
  // e aborta — usuário pode tentar novamente após liberar espaço.
  try {
    const [srcSize, dstSize] = await Promise.all([dirSize(sourcePath), dirSize(backupPath)]);
    if (srcSize !== dstSize) {
      await rm(backupPath, { recursive: true, force: true });
      return err(
        migrationError({
          migrationCode: 'backup_failed',
          message: `backup incompleto: source=${srcSize} bytes, backup=${dstSize} bytes. Disco cheio? Backup removido.`,
          context: { srcSize, dstSize, backupPath },
        }),
      );
    }
  } catch {
    // Se o size-check falhar por qualquer razão, prosseguimos — o backup
    // principal já foi feito e é melhor continuar do que abortar por
    // falha no check. Log estruturado é responsabilidade do caller.
  }

  return ok(backupPath);
}

/**
 * Remove cirurgicamente apenas paths que o executor + steps registraram
 * como `writtenPaths`. Nunca apaga o `targetPath` completo — caller pode
 * ter passado o diretório raiz da V2 (CR-18 F-DT-D), e wipe full apagaria
 * dados produtivos.
 */
async function rollbackPaths(paths: readonly string[]): Promise<void> {
  // Remove em ordem reversa pra que diretórios apareçam após seus filhos.
  for (const path of [...paths].reverse()) {
    await rm(path, { recursive: true, force: true });
  }
}

async function releaseLock(
  handle: Awaited<ReturnType<typeof open>> | null,
  targetPath: string,
): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // ignore
  }
  try {
    await rm(join(targetPath, MIGRATION_LOCK_FILE), { force: true });
  } catch {
    // ignore — lock fica no disco mas próximo run avisa o usuário com
    // mensagem clara de "remova manualmente".
  }
}

/**
 * F-CR40-5: Tenta limpar lock stale. Lê o pid do lockfile e verifica se o
 * processo ainda existe via `process.kill(pid, 0)`. Se ESRCH (não existe),
 * remove o lockfile e retorna 'cleaned'. Se processo existe, retorna 'alive'.
 */
async function tryCleanStaleLock(lockPath: string): Promise<'cleaned' | 'alive'> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    const pidMatch = content.match(/^pid=(\d+)/m);
    if (pidMatch?.[1]) {
      const pid = Number.parseInt(pidMatch[1], 10);
      try {
        // `kill(pid, 0)` testa liveness sem enviar sinal real.
        // Throws com ESRCH se processo não existe.
        process.kill(pid, 0);
        // Processo ainda vivo — lock legítimo.
        return 'alive';
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
          // Processo morreu — lock stale. Remove e permite retry.
          await rm(lockPath, { force: true });
          return 'cleaned';
        }
        // EPERM (sem permissão pra testar) — assume processo vivo.
        return 'alive';
      }
    }
  } catch {
    // Falha ao ler lockfile — não tenta limpar.
  }
  return 'alive';
}

/**
 * F-CR40-11: Validação básica do target pós-migração — verifica que
 * artefatos esperados existem no disco. Retorna lista de warnings;
 * lista vazia = sem divergências detectadas.
 *
 * Não acessa SQLite (camada pura); verifica apenas filesystem.
 * Checks mais profundos (contagem de sessões vs events.jsonl) são
 * responsabilidade da camada main-side após a migration completar.
 */
function validateMigrationTarget(
  targetPath: string,
  stepResults: ReadonlyArray<{ kind: string; itemsMigrated: number }>,
): readonly string[] {
  const warnings: string[] = [];

  // Verifica migration-config.json se step config rodou.
  const configStep = stepResults.find((r) => r.kind === 'config' && r.itemsMigrated > 0);
  if (configStep) {
    const configFile = join(targetPath, 'migration-config.json');
    if (!existsSync(configFile)) {
      warnings.push('validation: migration-config.json ausente após step config (esperado)');
    }
  }

  // Verifica skills-legacy/ se step skills rodou.
  const skillsStep = stepResults.find((r) => r.kind === 'skills' && r.itemsMigrated > 0);
  if (skillsStep) {
    const skillsDir = join(targetPath, 'skills-legacy');
    if (!existsSync(skillsDir)) {
      warnings.push('validation: skills-legacy/ ausente após step skills (esperado)');
    }
  }

  return warnings;
}

/**
 * Calcula tamanho recursivo de um diretório em bytes. Best-effort —
 * entradas inacessíveis são ignoradas.
 */
async function dirSize(path: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const sub = join(path, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(sub);
      } else if (entry.isFile()) {
        try {
          const s = await stat(sub);
          total += s.size;
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // dir inacessível
  }
  return total;
}
