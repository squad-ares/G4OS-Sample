import type { Arch, Platform, Runtime, RuntimeSource } from './types.ts';
import { RUNTIME_VERSIONS } from './versions.ts';

export function resolveSource(
  runtime: Runtime,
  platform: Platform,
  arch: Arch,
): RuntimeSource | null {
  switch (runtime) {
    case 'node':
      return resolveNode(platform, arch);
    case 'pnpm':
      return resolvePnpm(platform, arch);
    case 'uv':
      return resolveUv(platform, arch);
    case 'python':
      return resolvePython(platform, arch);
    case 'git':
      return resolveGit(platform, arch);
  }
}

function resolveNode(platform: Platform, arch: Arch): RuntimeSource {
  const v = RUNTIME_VERSIONS.node;
  const platformPart = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : 'win';
  const archPart = arch === 'x64' ? 'x64' : 'arm64';
  const format: RuntimeSource['format'] = platform === 'win32' ? 'zip' : 'tar.xz';
  const ext = format === 'zip' ? 'zip' : 'tar.xz';
  const base = `node-v${v}-${platformPart}-${archPart}`;
  const binaryRelativePath = platform === 'win32' ? `${base}/node.exe` : `${base}/bin/node`;

  return {
    runtime: 'node',
    url: `https://nodejs.org/dist/v${v}/${base}.${ext}`,
    archiveName: `${base}.${ext}`,
    format,
    binaryRelativePath,
  };
}

function resolvePnpm(platform: Platform, arch: Arch): RuntimeSource {
  const v = RUNTIME_VERSIONS.pnpm;
  const target =
    platform === 'darwin'
      ? arch === 'arm64'
        ? 'macos-arm64'
        : 'macos-x64'
      : platform === 'linux'
        ? arch === 'arm64'
          ? 'linux-arm64'
          : 'linux-x64'
        : arch === 'arm64'
          ? 'win-arm64.exe'
          : 'win-x64.exe';

  // pnpm publica binários standalone (não tarball). Tratamos como "archive"
  // trivial — download direto; extrator copia o arquivo para o destino.
  const archiveName = `pnpm-${target}`;
  return {
    runtime: 'pnpm',
    url: `https://github.com/pnpm/pnpm/releases/download/v${v}/${archiveName}`,
    archiveName,
    format: platform === 'win32' ? 'zip' : 'tar.gz', // placeholder — download.ts usa branch "binary"
    binaryRelativePath: platform === 'win32' ? 'pnpm.exe' : 'pnpm',
  };
}

function resolveUv(platform: Platform, arch: Arch): RuntimeSource {
  const v = RUNTIME_VERSIONS.uv;
  const target =
    platform === 'darwin'
      ? arch === 'arm64'
        ? 'aarch64-apple-darwin'
        : 'x86_64-apple-darwin'
      : platform === 'linux'
        ? arch === 'arm64'
          ? 'aarch64-unknown-linux-gnu'
          : 'x86_64-unknown-linux-gnu'
        : // Windows: Astral não publica binário nativo arm64. Usa x86_64
          // para ambas as archs — Windows 11 arm64 roda via emulação x64.
          'x86_64-pc-windows-msvc';

  const format: RuntimeSource['format'] = platform === 'win32' ? 'zip' : 'tar.gz';
  const ext = format === 'zip' ? 'zip' : 'tar.gz';
  const base = `uv-${target}`;
  const binary = platform === 'win32' ? `${base}/uv.exe` : `${base}/uv`;

  return {
    runtime: 'uv',
    url: `https://github.com/astral-sh/uv/releases/download/${v}/${base}.${ext}`,
    archiveName: `${base}.${ext}`,
    format,
    binaryRelativePath: binary,
  };
}

function resolvePython(platform: Platform, arch: Arch): RuntimeSource {
  const v = RUNTIME_VERSIONS.python;
  const tag = RUNTIME_VERSIONS.pythonBuildTag;
  const target =
    platform === 'darwin'
      ? arch === 'arm64'
        ? 'aarch64-apple-darwin'
        : 'x86_64-apple-darwin'
      : platform === 'linux'
        ? arch === 'arm64'
          ? 'aarch64-unknown-linux-gnu'
          : 'x86_64-unknown-linux-gnu'
        : arch === 'arm64'
          ? 'aarch64-pc-windows-msvc'
          : 'x86_64-pc-windows-msvc';

  // python-build-standalone: formato `cpython-{version}+{tag}-{target}-install_only.tar.gz`
  const archiveName = `cpython-${v}+${tag}-${target}-install_only.tar.gz`;
  const binary =
    platform === 'win32'
      ? 'python/python.exe'
      : `python/bin/python${v.split('.').slice(0, 2).join('.')}`;

  return {
    runtime: 'python',
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/${archiveName}`,
    archiveName,
    format: 'tar.gz',
    binaryRelativePath: binary,
  };
}

function resolveGit(platform: Platform, _arch: Arch): RuntimeSource | null {
  // Git portable só no Windows. macOS/Linux sempre têm git de sistema.
  if (platform !== 'win32') return null;

  const v = RUNTIME_VERSIONS.git;
  // MinGit não publica build nativo arm64 — Windows 11 arm64 roda x64 via
  // emulação. Usamos sempre o 64-bit x86_64.
  const archiveName = `MinGit-${v}-64-bit.zip`;

  return {
    runtime: 'git',
    url: `https://github.com/git-for-windows/git/releases/download/v${v}.windows.1/${archiveName}`,
    archiveName,
    format: 'zip',
    binaryRelativePath: 'cmd/git.exe',
  };
}
