#!/usr/bin/env tsx
/**
 * CLI para migração V1 → V2.
 *
 * Uso:
 *   pnpm migrate:v1                    # detect + plan + execute (interativo)
 *   pnpm migrate:v1 --dry-run          # detect + plan, não escreve
 *   pnpm migrate:v1 --source <path>    # path V1 explícito (override detector)
 *   pnpm migrate:v1 --target <path>    # path V2 destino (override env-paths)
 *   pnpm migrate:v1 --force            # ignora .migration-done marker
 *   pnpm migrate:v1 --steps a,b,c      # subset de steps
 *
 * Exit codes:
 *   0  sucesso (ou dry-run sem warnings críticos)
 *   1  V1 install não encontrado
 *   2  V2 já migrado (sem --force)
 *   3  step falhou (rollback executado)
 *   4  args inválidos
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createMigrationPlan,
  detectV1Install,
  execute,
  type MigrationStepKind,
  type ProgressEvent,
} from '@g4os/migration';

interface CliArgs {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly source?: string;
  readonly target?: string;
  readonly steps?: ReadonlySet<MigrationStepKind>;
}

const VALID_STEP_KINDS: readonly MigrationStepKind[] = [
  'config',
  'credentials',
  'workspaces',
  'sessions',
  'sources',
  'skills',
];

function parseArgs(argv: readonly string[]): CliArgs | { error: string } {
  const args = argv.slice(2);
  let dryRun = false;
  let force = false;
  let source: string | undefined;
  let target: string | undefined;
  let steps: ReadonlySet<MigrationStepKind> | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--force') force = true;
    else if (a === '--source') source = args[++i];
    else if (a === '--target') target = args[++i];
    else if (a === '--steps') {
      const raw = args[++i];
      if (!raw) return { error: '--steps exige valor (csv)' };
      const parts = raw.split(',').map((s) => s.trim());
      const invalid = parts.find((p) => !VALID_STEP_KINDS.includes(p as MigrationStepKind));
      if (invalid) return { error: `step inválido: "${invalid}"` };
      steps = new Set(parts as MigrationStepKind[]);
    } else if (a === '--help' || a === '-h') {
      return { error: 'help' };
    } else {
      return { error: `arg desconhecido: ${a}` };
    }
  }

  return {
    dryRun,
    force,
    ...(source ? { source } : {}),
    ...(target ? { target } : {}),
    ...(steps ? { steps } : {}),
  };
}

function printHelp(): void {
  process.stdout.write(`
G4 OS — V1 → V2 migration tool

Uso:
  pnpm migrate:v1 [flags]

Flags:
  --dry-run              não escreve nada, só relata o plano
  --force                ignora .migration-done marker (re-migra)
  --source <path>        path V1 explícito (default: detect em $HOME/.g4os*)
  --target <path>        path V2 explícito (default: env-paths data dir)
  --steps <a,b,c>        subset csv de steps (config|credentials|workspaces|sessions|sources|skills)
  --help, -h             esta mensagem
`);
}

function defaultV2Target(): string {
  // Mirror env-paths sem importar o pacote (CLI roda fora do runtime).
  // Usuário pode sempre fornecer --target explícito.
  const platform = process.platform;
  const home = homedir();
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'g4os');
  if (platform === 'win32') {
    // biome-ignore lint/style/noProcessEnv: CLI fora do runtime; APPDATA é convenção Windows
    const appData = process.env['APPDATA'];
    return join(appData ?? join(home, 'AppData', 'Roaming'), 'g4os');
  }
  return join(home, '.local', 'share', 'g4os');
}

function logProgress(ev: ProgressEvent): void {
  const pct = Math.floor(ev.stepProgress * 100);
  process.stdout.write(
    `[${ev.stepIndex + 1}/${ev.stepCount}] ${ev.stepKind}: ${pct}% — ${ev.message}\n`,
  );
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);
  if ('error' in parsed) {
    if (parsed.error === 'help') {
      printHelp();
      return 0;
    }
    process.stderr.write(`erro: ${parsed.error}\n`);
    printHelp();
    return 4;
  }

  // 1) Detect (ou usa --source)
  const v1 = parsed.source
    ? { path: parsed.source, version: null, flavor: 'public' as const }
    : await detectV1Install();
  if (!v1) {
    process.stderr.write('V1 install não encontrado em $HOME/.g4os ou $HOME/.g4os-public\n');
    return 1;
  }
  process.stdout.write(`V1 detectado: ${v1.path} (version=${v1.version ?? 'desconhecida'})\n`);

  // 2) Plan
  const target = parsed.target ?? defaultV2Target();
  const plan = await createMigrationPlan({ source: v1, target });

  process.stdout.write(`Plano:\n  source: ${plan.source.path}\n  target: ${plan.target}\n`);
  process.stdout.write(`  steps:\n`);
  for (const s of plan.steps) {
    process.stdout.write(
      `    - ${s.kind}: ${s.description} (count=${s.count}, bytes=${s.estimatedBytes})\n`,
    );
  }
  if (plan.warnings.length > 0) {
    process.stdout.write(`  warnings:\n`);
    for (const w of plan.warnings) process.stdout.write(`    ⚠️  ${w}\n`);
  }

  if (plan.alreadyMigrated && !parsed.force) {
    process.stderr.write('V2 já migrado (.migration-done presente). Use --force para re-migrar.\n');
    return 2;
  }

  // 3) Execute
  const result = await execute(plan, {
    dryRun: parsed.dryRun,
    force: parsed.force,
    onProgress: logProgress,
    ...(parsed.steps ? { stepFilter: parsed.steps } : {}),
  });

  if (result.isErr()) {
    process.stderr.write(`migração falhou: ${result.error.message}\n`);
    return 3;
  }

  const report = result.value;
  process.stdout.write(`\nMigração concluída:\n`);
  process.stdout.write(`  duração: ${report.finishedAt - report.startedAt}ms\n`);
  if (report.backupPath) {
    process.stdout.write(`  backup V1: ${report.backupPath}\n`);
  }
  for (const sr of report.stepResults) {
    process.stdout.write(
      `  ${sr.kind}: ${sr.itemsMigrated} migrados, ${sr.itemsSkipped} skip, ${sr.bytesProcessed} bytes\n`,
    );
    for (const w of sr.nonFatalWarnings) process.stdout.write(`    ⚠️  ${w}\n`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`erro fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(99);
  });
