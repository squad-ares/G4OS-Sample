import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { formatMissingEnv, loadSupabaseEnvFiles, validateSupabaseEnv } from '@g4os/auth/supabase';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths, initRuntimePaths, validateRuntimeIntegrity } from '@g4os/platform';

const log = createLogger('startup-preflight');

export type StartupPreflightSeverity = 'fatal' | 'recoverable' | 'informational';
export type StartupPreflightStatus = 'ok' | 'recoverable' | 'fatal';

export interface StartupPreflightIssue {
  readonly code: string;
  readonly severity: StartupPreflightSeverity;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface StartupPreflightReport {
  readonly status: StartupPreflightStatus;
  readonly issues: readonly StartupPreflightIssue[];
  readonly createdDirectories: readonly string[];
  readonly envFilesLoaded: readonly string[];
}

export interface StartupPreflightOptions {
  readonly isPackaged: boolean;
  readonly rootDir: string;
}

export class StartupPreflightService {
  async run(options: StartupPreflightOptions): Promise<StartupPreflightReport> {
    const issues: StartupPreflightIssue[] = [];
    const createdDirectories: string[] = [];
    const filesLoaded: string[] = [];

    this.checkSupabaseEnv(options, issues, filesLoaded);
    await ensureAppDirectories(createdDirectories);
    await this.checkConfigIntegrity(issues);
    this.checkRuntimeIntegrity(options, issues);

    const status = issues.some((issue) => issue.severity === 'fatal')
      ? 'fatal'
      : issues.some((issue) => issue.severity === 'recoverable')
        ? 'recoverable'
        : 'ok';

    const report: StartupPreflightReport = {
      status,
      issues,
      createdDirectories,
      envFilesLoaded: filesLoaded,
    };

    if (status === 'ok') {
      log.info({ report }, 'startup preflight completed');
    } else {
      log.warn({ report }, 'startup preflight completed with issues');
    }

    return report;
  }

  private checkSupabaseEnv(
    options: StartupPreflightOptions,
    issues: StartupPreflightIssue[],
    filesLoaded: string[],
  ): void {
    const combined: Record<string, string | undefined> = {
      // biome-ignore lint/style/noProcessEnv: composition root; leitura controlada
      ...process.env,
    };

    if (!options.isPackaged) {
      const loaded = loadSupabaseEnvFiles(options.rootDir);
      filesLoaded.push(...loaded.filesLoaded);
      for (const [k, v] of Object.entries(loaded.env)) {
        if (combined[k] === undefined) combined[k] = v;
      }
    }

    const envResult = validateSupabaseEnv(combined);
    if (envResult.ok) return;

    // Em packaged, auth-runtime aplica fallback via constantes injetadas em
    // build time (electron.vite.config.ts → define) e degrada graciosamente
    // se ambos faltarem. Não bloquear o boot — tornar recoverable.
    issues.push({
      code: 'env.invalid',
      severity: options.isPackaged ? 'recoverable' : 'fatal',
      message: [
        options.isPackaged
          ? 'Supabase env não disponível em runtime; auth-runtime usará fallback de build time.'
          : 'Boot bloqueado: contrato de env Supabase incompleto para desktop.',
        formatMissingEnv(envResult.missing),
        `Arquivos carregados: ${filesLoaded.length > 0 ? filesLoaded.join(', ') : 'nenhum'}`,
      ].join('\n\n'),
      context: { filesLoaded, missing: envResult.missing },
    });
  }

  formatFatalDialog(report: StartupPreflightReport): string {
    return report.issues
      .filter((issue) => issue.severity === 'fatal')
      .map((issue) => issue.message)
      .join('\n\n');
  }

  private checkRuntimeIntegrity(
    options: StartupPreflightOptions,
    issues: StartupPreflightIssue[],
  ): void {
    const runtimeLocation = resolveRuntimeLocation(options);

    initRuntimePaths(runtimeLocation);

    const integrity = validateRuntimeIntegrity();
    if (integrity.ok) return;

    // Os 4 runtimes (claude-sdk-cli, interceptor, session-mcp-server,
    // bridge-mcp-server) são scaffolding pendente em V2. Até que
    // packages/bridge-mcp-server e packages/session-mcp-server sejam
    // implementados e empacotados, mantemos a check em modo `recoverable`
    // mesmo em produção — o app boota com aviso, fluxos que dependem
    // desses runtimes ficam degradados.
    issues.push({
      code: 'runtime.missing',
      severity: 'recoverable',
      message: options.isPackaged
        ? 'Runtimes secundarios ausentes (Claude SDK CLI, MCP servers). Funcionalidades dependentes ficam indisponiveis.'
        : 'Runtime bundle ainda nao esta presente no ambiente atual; o preflight continuou em modo informativo.',
      context: { missing: integrity.missing, runtimeLocation },
    });
  }

  private async checkConfigIntegrity(issues: StartupPreflightIssue[]): Promise<void> {
    const appPaths = getAppPaths();
    const primaryConfig = join(appPaths.config, 'config.json');
    const backupConfig = join(appPaths.config, 'config.backup.json');

    const primary = await inspectJsonFile(primaryConfig);
    const backup = await inspectJsonFile(backupConfig);

    if (!primary.exists && !backup.exists) {
      issues.push({
        code: 'config.first-run',
        severity: 'informational',
        message: 'Nenhum config principal foi encontrado ainda; assumindo primeiro boot.',
        context: { primaryConfig, backupConfig },
      });
      return;
    }

    if (primary.exists && !primary.valid && backup.valid) {
      issues.push({
        code: 'config.primary-corrupted',
        severity: 'recoverable',
        message:
          'O config principal esta corrompido, mas o backup continua legivel. A UI deve oferecer repair mode em vez de recriar tudo silenciosamente.',
        context: { primaryConfig, backupConfig },
      });
      return;
    }

    if (primary.exists && !primary.valid && backup.exists && !backup.valid) {
      issues.push({
        code: 'config.primary-and-backup-corrupted',
        severity: 'recoverable',
        message:
          'Config principal e backup estao ilegiveis. O app nao deve recriar estado automaticamente sem acao explicita do usuario.',
        context: { primaryConfig, backupConfig },
      });
    }
  }
}

async function ensureAppDirectories(createdDirectories: string[]): Promise<void> {
  const appPaths = getAppPaths();
  const requiredDirectories = [
    appPaths.config,
    appPaths.data,
    appPaths.cache,
    appPaths.state,
    appPaths.logs,
  ];

  for (const directory of requiredDirectories) {
    const existed = existsSync(directory);
    await mkdir(directory, { recursive: true });
    if (!existed) {
      createdDirectories.push(directory);
    }
  }
}

async function inspectJsonFile(
  path: string,
): Promise<{ readonly exists: boolean; readonly valid: boolean }> {
  if (!existsSync(path)) {
    return { exists: false, valid: false };
  }

  try {
    JSON.parse(await readFile(path, 'utf-8'));
    return { exists: true, valid: true };
  } catch {
    return { exists: true, valid: false };
  }
}

function resolveRuntimeLocation(options: StartupPreflightOptions): {
  readonly runtimeDir: string;
  readonly vendorDir: string;
} {
  if (options.isPackaged) {
    return {
      runtimeDir: join(process.resourcesPath, 'runtime'),
      vendorDir: join(process.resourcesPath, 'vendor'),
    };
  }

  return {
    runtimeDir: resolve(options.rootDir, 'apps/desktop/dist/runtime'),
    vendorDir: resolve(options.rootDir, 'apps/desktop/dist/vendor'),
  };
}
