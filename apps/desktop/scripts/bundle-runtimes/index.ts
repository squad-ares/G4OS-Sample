#!/usr/bin/env tsx
/**
 * Bundle runtimes (node, pnpm, uv, python, git) para uma combinação
 * platform × arch × profile. Chamado via `pnpm prebundle`.
 *
 * Flags (env):
 *   G4OS_BUNDLE_PROFILE=light|full           (default: full)
 *   G4OS_BUNDLE_PLATFORM=darwin|win32|linux  (default: process.platform)
 *   G4OS_BUNDLE_ARCH=x64|arm64               (default: process.arch)
 *   G4OS_BUNDLE_OUTPUT=<dir>                 (default: apps/desktop/dist)
 *   G4OS_BUNDLE_CHECKSUM_MODE=verify|capture (default: verify)
 *
 * Layout de saída:
 *   <output>/vendor/<runtime>/...
 *   <output>/runtime/<bridge artifacts>  (populado por outros scripts)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndExtract } from './download.ts';
import { resolveSource } from './sources.ts';
import {
  type Arch,
  type BundleProfile,
  type ChecksumsLockfile,
  checksumKey,
  type Platform,
  PROFILE_RUNTIMES,
} from './types.ts';
import { verifyBinary } from './verify.ts';
import { RUNTIME_VERSIONS } from './versions.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const profile = (process.env['G4OS_BUNDLE_PROFILE'] ?? 'full') as BundleProfile;
  const platform = (process.env['G4OS_BUNDLE_PLATFORM'] ?? process.platform) as Platform;
  const arch = (process.env['G4OS_BUNDLE_ARCH'] ?? process.arch) as Arch;
  const mode = (process.env['G4OS_BUNDLE_CHECKSUM_MODE'] ?? 'verify') as 'verify' | 'capture';

  const desktopRoot = resolve(__dirname, '../..');
  const outputDir = process.env['G4OS_BUNDLE_OUTPUT']
    ? resolve(process.env['G4OS_BUNDLE_OUTPUT'])
    : join(desktopRoot, 'dist');

  const vendorDir = join(outputDir, 'vendor');
  const runtimeDir = join(outputDir, 'runtime');

  console.log('[bundle-runtimes] starting');
  console.log(`  profile:  ${profile}`);
  console.log(`  platform: ${platform}/${arch}`);
  console.log(`  output:   ${vendorDir}`);
  console.log(`  mode:     ${mode}`);

  const lockfilePath = join(__dirname, 'checksums.json');
  const lockfile = await loadLockfile(lockfilePath);

  const runtimes = PROFILE_RUNTIMES[profile];
  const summary: Array<{ runtime: string; version: string; ok: boolean; reason?: string }> = [];

  for (const runtime of runtimes) {
    const version = resolveVersion(runtime);
    const source = resolveSource(runtime, platform, arch);

    if (!source) {
      console.log(`  • ${runtime}: skipped for ${platform}/${arch}`);
      summary.push({ runtime, version, ok: true, reason: 'skipped' });
      continue;
    }

    const key = checksumKey(runtime, platform, arch, version);
    const perRuntimeDir = join(vendorDir, runtime);
    console.log(`  • ${runtime} v${version}`);

    try {
      const download = await downloadAndExtract({
        source,
        targetDir: perRuntimeDir,
        checksumsLockfile: lockfile,
        checksumKey: key,
        mode,
      });

      const verify = await verifyBinary(runtime, download);
      if (!verify.ok) {
        throw new Error(verify.reason ?? 'verify failed');
      }
      console.log(`    ✓ ${verify.version}  (${(download.sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
      summary.push({ runtime, version: verify.version, ok: true });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`    ✗ ${reason}`);
      summary.push({ runtime, version, ok: false, reason });
    }
  }

  if (mode === 'capture') {
    await saveLockfile(lockfilePath, lockfile);
    console.log(`[bundle-runtimes] checksums captured → ${lockfilePath}`);
  }

  // Placeholder runtime dir para o afterPack não reclamar quando ninguém
  // populou bridge-mcp-server/session-mcp-server/etc ainda.
  await writeFile(join(runtimeDir, '.gitkeep'), '', 'utf-8').catch(() => {});

  const failed = summary.filter((s) => !s.ok);
  if (failed.length > 0) {
    console.error(`\n[bundle-runtimes] ${failed.length} runtime(s) failed:`);
    for (const f of failed) console.error(`  - ${f.runtime}: ${f.reason}`);
    process.exit(1);
  }

  console.log(`\n[bundle-runtimes] ${summary.length} runtime(s) OK`);
}

function resolveVersion(runtime: string): string {
  if (runtime === 'python') return RUNTIME_VERSIONS.python;
  return (RUNTIME_VERSIONS as Record<string, string>)[runtime] ?? 'unknown';
}

async function loadLockfile(path: string): Promise<ChecksumsLockfile> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as ChecksumsLockfile;
  } catch {
    return {};
  }
}

async function saveLockfile(path: string, lockfile: ChecksumsLockfile): Promise<void> {
  const sorted: ChecksumsLockfile = {};
  for (const key of Object.keys(lockfile).sort()) {
    const entry = lockfile[key];
    if (entry) sorted[key] = entry;
  }
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}

main().catch((err) => {
  console.error('[bundle-runtimes] fatal:', err);
  process.exit(1);
});
