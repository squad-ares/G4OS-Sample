export type Platform = 'darwin' | 'win32' | 'linux';
export type Arch = 'x64' | 'arm64';
export type BundleProfile = 'light' | 'full';

export type Runtime = 'node' | 'pnpm' | 'uv' | 'python' | 'git';

export const PROFILE_RUNTIMES: Record<BundleProfile, readonly Runtime[]> = {
  light: ['node', 'pnpm'],
  full: ['node', 'pnpm', 'uv', 'python', 'git'],
};

export interface RuntimeSource {
  runtime: Runtime;
  url: string;
  /** Nome do arquivo final (para cache e extração) */
  archiveName: string;
  /** Formato do archive — determina descompactação */
  format: 'tar.gz' | 'tar.xz' | 'zip';
  /** Caminho interno relativo pro binário após extrair (smoke test) */
  binaryRelativePath: string;
  /** Se true, extração desce um nível (tarball cria subdir) */
  stripComponents?: number;
}

export interface ChecksumEntry {
  sha256: string;
  capturedAt: string;
}

export type ChecksumsLockfile = Record<string, ChecksumEntry>;

export function checksumKey(
  runtime: Runtime,
  platform: Platform,
  arch: Arch,
  version: string,
): string {
  return `${runtime}-${version}-${platform}-${arch}`;
}
