/**
 * Install identity — manifesto de runtimes empacotados.
 *
 * `install-meta.json` é gerado pelo bundle script de release e fica em
 * `<resourcesPath>/install-meta.json` (packaged) ou no `dist/` em dev.
 * Documenta exatamente quais runtimes foram empacotados, com hashes,
 * para que o boot possa detectar:
 *
 *   - Build incompleta (manifesto ausente / corrupto)
 *   - Mismatch entre app version e manifest version (instalação misturada)
 *   - Hash mismatch dos binários (tamper, antivírus em quarentena, disk corruption)
 *
 * Hash check é caro (10MB+ de Node, 200MB de Python) — `verifyRuntimeHashes`
 * é async e on-demand (botão "Verificar integridade" no Repair Mode).
 * `loadInstallMeta` é leve e roda no boot sempre.
 *
 * Antes da V2 não existia identidade — atualizações no Windows que
 * mexiam no path produziam runtime "perdido" no PATH do sistema —
 * `validateRuntimeIntegrity` original só fazia `existsSync`.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const RUNTIME_NAMES = ['node', 'pnpm', 'uv', 'python', 'git'] as const;
export type RuntimeName = (typeof RUNTIME_NAMES)[number];

const RuntimeEntrySchema = z.object({
  /** Versão semantic do runtime (ex: '24.10.0'). */
  version: z.string().min(1),
  /** SHA-256 do **binário extraído** (não do archive). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/u, 'expected hex sha256'),
  /** Path relativo ao `vendorDir`, normalizado para POSIX. */
  binaryRelativePath: z.string().min(1),
});

export const InstallMetaSchema = z.object({
  schemaVersion: z.literal(1),
  /** Flavor de release (canary/beta/stable). Casa com auto-update channel. */
  flavor: z.enum(['stable', 'beta', 'canary']),
  /** Versão semver do app no momento do build. */
  appVersion: z.string().min(1),
  /** ISO 8601 do build. */
  builtAt: z.string().min(1),
  /** Platform/arch alvo do build (`darwin-arm64`, `win32-x64`, etc). */
  target: z.string().min(1),
  /**
   * Hashes esperados dos runtimes vendored. `z.record(z.string(), …)`
   * (não `z.enum(RUNTIME_NAMES)`) porque em Zod 4 o `record(z.enum, …)`
   * exige TODAS as keys do enum — quebra `light` profile que empacota
   * só `node` + `pnpm`. Validação restrita ao subset acontece em
   * `verifyRuntimeHashes` via `isRuntimeName` guard.
   */
  runtimes: z.record(z.string(), RuntimeEntrySchema).optional().default({}),
});

export type InstallMeta = z.infer<typeof InstallMetaSchema>;
export type RuntimeEntry = z.infer<typeof RuntimeEntrySchema>;

export type IntegrityFailure =
  | { readonly code: 'meta_missing'; readonly path: string }
  | { readonly code: 'meta_corrupt'; readonly path: string; readonly cause: string }
  | {
      readonly code: 'app_version_mismatch';
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly code: 'runtime_missing';
      readonly runtime: RuntimeName;
      readonly path: string;
    }
  | {
      readonly code: 'hash_mismatch';
      readonly runtime: RuntimeName;
      readonly expected: string;
      readonly actual: string;
    };

export interface LoadInstallMetaOptions {
  /** Caminho onde procurar o `install-meta.json` (resourcesPath ou dist). */
  readonly resourcesPath: string;
  /** Versão do app em runtime — opcional. Quando informado, faz cross-check. */
  readonly appVersion?: string;
}

export type LoadInstallMetaResult =
  | { readonly ok: true; readonly meta: InstallMeta }
  | { readonly ok: false; readonly failure: IntegrityFailure };

const FILE_NAME = 'install-meta.json';

/**
 * Carrega e valida o manifesto. Falha rápido (sem hash check) — para o
 * boot. Use `verifyRuntimeHashes` separadamente quando precisar.
 */
export async function loadInstallMeta(
  options: LoadInstallMetaOptions,
): Promise<LoadInstallMetaResult> {
  const path = join(options.resourcesPath, FILE_NAME);
  if (!existsSync(path)) {
    return { ok: false, failure: { code: 'meta_missing', path } };
  }

  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (cause) {
    return {
      ok: false,
      failure: { code: 'meta_corrupt', path, cause: describeError(cause) },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      ok: false,
      failure: { code: 'meta_corrupt', path, cause: describeError(cause) },
    };
  }

  const result = InstallMetaSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      failure: { code: 'meta_corrupt', path, cause: result.error.message },
    };
  }

  const meta = result.data;

  if (options.appVersion && meta.appVersion !== options.appVersion) {
    return {
      ok: false,
      failure: {
        code: 'app_version_mismatch',
        expected: meta.appVersion,
        actual: options.appVersion,
      },
    };
  }

  return { ok: true, meta };
}

export interface VerifyRuntimeHashesOptions {
  readonly meta: InstallMeta;
  readonly vendorDir: string;
}

export interface VerifyRuntimeHashesResult {
  readonly ok: boolean;
  readonly failures: readonly IntegrityFailure[];
}

/**
 * Computa SHA-256 de cada runtime vendored e compara com o manifest.
 *
 * **Caro** — 200MB+ de I/O em build full. Use on-demand, não no boot.
 * Por design, **não para no primeiro erro** — itera todos os runtimes
 * para que a UI possa mostrar a lista completa de problemas.
 */
export async function verifyRuntimeHashes(
  options: VerifyRuntimeHashesOptions,
): Promise<VerifyRuntimeHashesResult> {
  const failures: IntegrityFailure[] = [];

  for (const [name, entry] of Object.entries(options.meta.runtimes)) {
    if (!isRuntimeName(name)) continue;
    const binaryPath = join(options.vendorDir, name, entry.binaryRelativePath);
    if (!existsSync(binaryPath)) {
      failures.push({ code: 'runtime_missing', runtime: name, path: binaryPath });
      continue;
    }
    const actual = await sha256OfFile(binaryPath);
    if (actual !== entry.sha256) {
      failures.push({
        code: 'hash_mismatch',
        runtime: name,
        expected: entry.sha256,
        actual,
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise());
    stream.on('error', (err) => rejectPromise(err));
  });
  return hash.digest('hex');
}

function isRuntimeName(name: string): name is RuntimeName {
  return (RUNTIME_NAMES as readonly string[]).includes(name);
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
