import { join, resolve } from 'node:path';
import { formatMissingEnv, loadSupabaseEnvFiles, validateSupabaseEnv } from '@g4os/auth/supabase';
import { createLogger } from '@g4os/kernel/logger';
import {
  getAppPaths,
  initRuntimePaths,
  loadInstallMeta,
  validateRuntimeIntegrity,
} from '@g4os/platform';
import {
  ensureAppDirectories,
  inspectJsonFile,
  installMetaIssue,
  resolveRuntimeLocation,
} from './startup-preflight-helpers.ts';
import type {
  StartupPreflightIssue,
  StartupPreflightOptions,
  StartupPreflightReport,
} from './startup-preflight-types.ts';

export type {
  StartupPreflightIssue,
  StartupPreflightOptions,
  StartupPreflightReport,
  StartupPreflightSeverity,
  StartupPreflightStatus,
} from './startup-preflight-types.ts';

const log = createLogger('startup-preflight');

export class StartupPreflightService {
  async run(options: StartupPreflightOptions): Promise<StartupPreflightReport> {
    const issues: StartupPreflightIssue[] = [];
    const createdDirectories: string[] = [];
    const filesLoaded: string[] = [];

    this.checkSupabaseEnv(options, issues, filesLoaded);
    await ensureAppDirectories(createdDirectories);
    await this.checkConfigIntegrity(issues);
    await this.checkInstallMeta(options, issues);
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

  /**
   * Valida `install-meta.json` (identidade do build) antes
   * de qualquer outra checagem de runtime.
   *
   *   - meta_missing: build incompleta — fatal em packaged, ignorado em dev.
   *   - meta_corrupt: arquivo presente mas inválido — fatal sempre que estiver.
   *   - app_version_mismatch: instalação misturada — fatal (orienta reinstalar).
   *
   * Hash check é deliberadamente fora daqui (caro). Repair Mode oferece
   * `Verificar integridade` on-demand via `verifyRuntimeHashes`.
   */
  private async checkInstallMeta(
    options: StartupPreflightOptions,
    issues: StartupPreflightIssue[],
  ): Promise<void> {
    const resourcesPath = options.isPackaged
      ? process.resourcesPath
      : resolve(options.rootDir, 'apps/desktop/dist');

    const result = await loadInstallMeta({
      resourcesPath,
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    });

    if (result.ok) {
      log.info(
        {
          appVersion: result.meta.appVersion,
          flavor: result.meta.flavor,
          target: result.meta.target,
          builtAt: result.meta.builtAt,
        },
        'install identity verified',
      );
      return;
    }

    const failure = result.failure;
    const issue = installMetaIssue(options.isPackaged, failure);
    issues.push(issue);

    // Telemetria: fatal install-meta vira log.error com contexto
    // estruturado. O pino transport para Sentry (em observability-runtime)
    // consome `level=error` como event, não breadcrumb — o que é o
    // comportamento desejado para falhas de identidade de build.
    const logPayload = {
      code: issue.code,
      failure,
      isPackaged: options.isPackaged,
      appVersion: options.appVersion ?? '<unknown>',
    };
    if (issue.severity === 'fatal') {
      log.error(logPayload, 'install identity failure (fatal)');
    } else if (issue.severity === 'recoverable') {
      log.warn(logPayload, 'install identity failure (recoverable)');
    } else {
      log.info(logPayload, 'install identity check produced informational issue');
    }
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
