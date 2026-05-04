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

import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';

export const RUNTIME_NAMES = ['node', 'pnpm', 'uv', 'python', 'git'] as const;
export type RuntimeName = (typeof RUNTIME_NAMES)[number];

const RuntimeEntrySchema = z.object({
  /** Versão semantic do runtime (ex: '24.10.0'). */
  version: z.string().min(1),
  /** SHA-256 do **binário extraído** (não do archive). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/u, 'expected hex sha256'),
  /**
   * Path relativo ao `vendorDir`, normalizado para POSIX.
   *
   * CR-38 F-CR38-1: defesa-em-profundidade contra `install-meta.json`
   * adulterado. `path.join(vendorDir, name, rel)` não rejeita escape de
   * tree — `..`, paths absolutos (POSIX `/`, Windows drive letter, UNC
   * `\\server\`) e NULL bytes resolvem para fora do `vendorDir`. O
   * resultado é exposto em `failures[].path` (UI Repair Mode) e o
   * hash em `failures[].actual` (SHA-256 de arquivo arbitrário). Mesmo
   * padrão do `isUnsafeZipPath` em `data/backup/import.ts:108-116` e
   * do `assertSafeId` em `platform/paths.ts:36-43`.
   *
   * Aceita: `bin/node`, `cmd/git.exe`, `python/bin/python3`. Rejeita
   * NULL bytes, leading `/`/`\`, `<drive>:` Windows, UNC `\\`, segments
   * `..`.
   */
  binaryRelativePath: z
    .string()
    .min(1)
    .regex(/^(?!.*\0)(?![\\/])(?![a-zA-Z]:)(?!\\\\)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[\w./-]+$/u, {
      message:
        'binaryRelativePath must be a relative path without `..`, NULL bytes, drive letters, UNC, or absolute roots',
    }),
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
  // CR-38 F-CR38-2: distingue manifesto de outro target (build win32 em
  // runtime macOS, build x64 em rosetta sem rebuild) do erro cascata
  // "runtime_missing × N" que oculta a causa raiz. `expected` é o target
  // declarado no manifesto; `actual` é `${process.platform}-${process.arch}`
  // do runtime atual passado pelo caller via `options.target`.
  | {
      readonly code: 'target_mismatch';
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
  /**
   * CR-38 F-CR38-2: target em runtime no formato `${platform}-${arch}` (ex:
   * `darwin-arm64`, `win32-x64`). Quando informado, faz cross-check do
   * `meta.target` e falha cedo com `target_mismatch` em vez de cascata
   * "runtime_missing × N" que oculta causa raiz. Composition root deriva
   * via `${process.platform}-${process.arch}` (ou `getPlatformInfo()`
   * equivalentes) e passa.
   */
  readonly target?: string;
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

  // CR-38 F-CR38-2: cross-check de target. Sem isso, manifesto win32
  // carregado em macOS (build dev híbrido, rosetta sem rebuild, machine
  // pull cruzado) passava parsing OK e o boot prosseguia para
  // `verifyRuntimeHashes` que devolvia `failures: [runtime_missing × N]`,
  // ocultando a causa raiz "manifest do build de outra plataforma".
  if (options.target && meta.target !== options.target) {
    return {
      ok: false,
      failure: {
        code: 'target_mismatch',
        expected: meta.target,
        actual: options.target,
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
    // CR-43 F-CR43-6: defesa contra symlink escape. O regex em
    // `binaryRelativePath` bloqueia `..` e paths absolutos (manifesto
    // adulterado), mas um atacante com acesso de escrita ao vendorDir pode
    // criar `vendorDir/node/bin/node → /etc/passwd`. `realpath` resolve o
    // symlink; `path.relative` verifica que o target real ainda está dentro
    // do vendorDir antes de calcular o hash. Sem esse check, `sha256OfFile`
    // computaria o hash de um arquivo arbitrário fora do tree.
    try {
      const realVendorDir = realpathSync(options.vendorDir);
      const realBinaryPath = realpathSync(binaryPath);
      const rel = relative(realVendorDir, realBinaryPath);
      if (rel.startsWith('..') || rel.startsWith('/')) {
        failures.push({ code: 'runtime_missing', runtime: name, path: binaryPath });
        continue;
      }
    } catch {
      // realpathSync pode falhar se o symlink está quebrado (target não existe)
      // — trata como runtime_missing para evitar hash de arquivo inexistente.
      failures.push({ code: 'runtime_missing', runtime: name, path: binaryPath });
      continue;
    }
    const actual = await sha256OfFile(binaryPath);
    // Timing-safe compare em vez de `!==` direto. Cenário de timing
    // side-channel é acadêmico aqui (FS access local já implica game
    // over), mas é defesa-em-profundidade padrão pra hash comparison.
    if (!hexEquals(actual, entry.sha256)) {
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

/**
 * Compara duas strings hex em tempo constante. Tamanhos diferentes
 * retornam false sem invocar `timingSafeEqual` (que rejeita buffers de
 * tamanhos distintos). SHA-256 sempre é 64 chars hex, mas o length
 * check explícito blinda contra hashes corrompidos.
 */
function hexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
