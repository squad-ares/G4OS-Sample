export function readRuntimeEnv(name: string): string | undefined {
  // biome-ignore lint/style/noProcessEnv: ponto único auditável de leitura
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Constantes embutidas em build time via electron-vite `define`. Em dev sem
// env vars o valor é string vazia e os serviços degradam graciosamente (NOOP
// Sentry, managed endpoint ausente, etc.). Em packaged release, o vite bake
// os valores do CI — process.env não está disponível na máquina do usuário.
declare const __G4OS_SENTRY_DSN__: string;
declare const __G4OS_SENTRY_ENVIRONMENT__: string;
declare const __G4OS_SENTRY_RELEASE__: string;
declare const __G4OS_MANAGED_API_BASE__: string;
declare const __G4OS_VIEWER_URL__: string;

type BuildTimeConst =
  | '__G4OS_SENTRY_DSN__'
  | '__G4OS_SENTRY_ENVIRONMENT__'
  | '__G4OS_SENTRY_RELEASE__'
  | '__G4OS_MANAGED_API_BASE__'
  | '__G4OS_VIEWER_URL__';

export function readBuildTimeConst(name: BuildTimeConst): string | undefined {
  try {
    let raw: string;
    if (name === '__G4OS_SENTRY_DSN__') raw = __G4OS_SENTRY_DSN__;
    else if (name === '__G4OS_SENTRY_ENVIRONMENT__') raw = __G4OS_SENTRY_ENVIRONMENT__;
    else if (name === '__G4OS_SENTRY_RELEASE__') raw = __G4OS_SENTRY_RELEASE__;
    else if (name === '__G4OS_MANAGED_API_BASE__') raw = __G4OS_MANAGED_API_BASE__;
    else raw = __G4OS_VIEWER_URL__;
    return typeof raw === 'string' && raw !== name && raw.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
}
