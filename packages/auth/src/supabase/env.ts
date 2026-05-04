import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';

const log = createLogger('auth:supabase-env');

export const SUPABASE_ENV_FILE_NAMES = ['.env', '.env.local'] as const;

export interface SupabaseEnv {
  readonly url: string;
  readonly key: string;
}

export interface SupabaseEnvLoadResult {
  readonly filesLoaded: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Lê `.env` e `.env.local` da raiz do repositório e devolve um `Record`
 * puro (não muta `process.env`). O composition root de `apps/desktop`
 * passa esse record adiante para o adapter Supabase — nenhuma outra
 * camada precisa conhecer o formato.
 */
export function loadSupabaseEnvFiles(rootDir: string): SupabaseEnvLoadResult {
  const filesLoaded: string[] = [];
  const env: Record<string, string> = {};

  for (const fileName of SUPABASE_ENV_FILE_NAMES) {
    const path = join(rootDir, fileName);
    if (!existsSync(path)) continue;

    // F-CR32-10: `existsSync` é insuficiente — arquivo pode existir e ser
    // ilegível (EACCES, antivírus no Windows, symlink quebrado). Sem try/catch
    // a exceção propagava até o caller (auth-runtime.ts) sem try/catch,
    // travando o boot antes da janela aparecer.
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (cause) {
      log.warn(
        { path, err: cause instanceof Error ? cause.message : String(cause) },
        'could not read env file; skipping',
      );
      continue;
    }
    const pairs = parseEnvFile(raw);
    for (const [key, value] of Object.entries(pairs)) {
      if (env[key] === undefined) env[key] = value;
    }
    filesLoaded.push(path);
  }

  return { filesLoaded, env };
}

export interface SupabaseEnvValidationResult {
  readonly ok: boolean;
  readonly env?: SupabaseEnv;
  readonly missing: readonly string[];
}

/**
 * Valida o contrato mínimo de env do Supabase: URL + (ANON_KEY ou
 * PUBLISHABLE_KEY). Aceita qualquer objeto-like (p. ex. `process.env`
 * no main do Electron, ou o record devolvido por `loadSupabaseEnvFiles`).
 */
export function validateSupabaseEnv(
  source: Readonly<Record<string, string | undefined>>,
): SupabaseEnvValidationResult {
  const url = source['SUPABASE_URL']?.trim();
  const key = (source['SUPABASE_ANON_KEY'] ?? source['SUPABASE_PUBLISHABLE_KEY'])?.trim();

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY');

  if (!url || !key) {
    return { ok: false, missing };
  }

  if (!isPlausibleUrl(url)) {
    return { ok: false, missing: ['SUPABASE_URL (valor inválido)'] };
  }

  return { ok: true, env: { url, key }, missing: [] };
}

/**
 * Resolve env a partir de um objeto, voltando para `Result<SupabaseEnv, AppError>`
 * quando a validação deve bloquear execução (ex: composição do adapter).
 */
export function resolveSupabaseEnv(
  source: Readonly<Record<string, string | undefined>>,
): Result<SupabaseEnv, AppError> {
  const result = validateSupabaseEnv(source);
  if (result.ok && result.env) return ok(result.env);
  return err(
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: formatMissingEnv(result.missing),
      context: { missing: result.missing },
    }),
  );
}

export function formatMissingEnv(missing: readonly string[]): string {
  if (missing.length === 0) return 'Supabase env válido.';
  return [
    'Login OTP indisponível. Configure as variáveis do Supabase antes de subir o app:',
    ...missing.map((name) => `  - ${name}`),
    'Use `.env` ou `.env.local` na raiz do monorepo (veja `.env.example`).',
  ].join('\n');
}

function isPlausibleUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseEnvFile(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Z0-9_]+$/u.test(key)) continue;

    const rawValue = normalized.slice(separatorIndex + 1).trim();
    parsed[key] = normalizeEnvValue(rawValue);
  }

  return parsed;
}

function normalizeEnvValue(raw: string): string {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}
