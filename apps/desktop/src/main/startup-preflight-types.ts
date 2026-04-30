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
  /**
   * Versão do app em runtime (`app.getVersion()`). Quando informado,
   * `loadInstallMeta` faz cross-check `meta.appVersion === appVersion`
   * para detectar instalação misturada.
   */
  readonly appVersion?: string;
}
