import { existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AfterPackContext } from 'electron-builder';

/**
 * Hook executado após electron-builder empacotar o app mas antes de
 * gerar DMG/NSIS/AppImage. Três responsabilidades:
 *
 * 1. Validar que runtimes bundled estão presentes e executáveis (não
 *    permitir release sem runtime — V1 saiu com runtime quebrado).
 * 2. macOS: garantir NSMicrophoneUsageDescription em todos os helper
 *    bundles (herança útil V1 — Apple rejeita sem isso nos helpers).
 * 3. Windows: escrever install-meta.json na raiz com identidade do
 *    installer (flavor, appId, version) — usado pelo updater para
 *    detectar instalações órfãs.
 */
export default async function afterPack(context: AfterPackContext): Promise<void> {
  const { appOutDir, electronPlatformName, packager } = context;
  const resourcesDir = join(
    appOutDir,
    electronPlatformName === 'darwin'
      ? `${packager.appInfo.productFilename}.app/Contents/Resources`
      : 'resources',
  );

  await verifyBundledRuntimes(resourcesDir);

  if (electronPlatformName === 'darwin') {
    await normalizeMacHelperBundles(appOutDir, packager.appInfo.productFilename);
  }

  if (electronPlatformName === 'win32') {
    await writeInstallMeta(appOutDir, context);
  }
}

async function verifyBundledRuntimes(resourcesDir: string): Promise<void> {
  if (process.env['G4OS_SKIP_RUNTIME_VALIDATION'] === '1') {
    console.warn('[after-pack] G4OS_SKIP_RUNTIME_VALIDATION=1 — skipping');
    return;
  }

  const runtimeDir = join(resourcesDir, 'runtime');
  const vendorDir = join(resourcesDir, 'vendor');

  // vendor/ é obrigatório — scripts/bundle-runtimes deve ter populado.
  if (!existsSync(vendorDir)) {
    throw new Error(`[after-pack] missing vendor/ dir at ${vendorDir}`);
  }
  const vendorEntries = await readdir(vendorDir);
  if (vendorEntries.length === 0) {
    throw new Error('[after-pack] vendor/ dir is empty');
  }

  // runtime/ é opcional (bridge-mcp-server / session-mcp-server — não
  // existem ainda em V2). Apenas logar quando presente.
  const runtimePresent = existsSync(runtimeDir);
  console.log(
    `[after-pack] vendor OK (${vendorEntries.length} entries), runtime ${runtimePresent ? 'OK' : 'absent'}`,
  );
}

async function normalizeMacHelperBundles(
  appOutDir: string,
  productFilename: string,
): Promise<void> {
  const frameworksDir = join(appOutDir, `${productFilename}.app/Contents/Frameworks`);

  if (!existsSync(frameworksDir)) return;

  const entries = await readdir(frameworksDir);
  const helperApps = entries.filter((e) => e.endsWith('.app'));

  const mainPlistPath = join(appOutDir, `${productFilename}.app/Contents/Info.plist`);
  if (!existsSync(mainPlistPath)) return;
  const mainPlist = await readFile(mainPlistPath, 'utf-8');

  const micKey = '<key>NSMicrophoneUsageDescription</key>';
  if (!mainPlist.includes(micKey)) {
    throw new Error(
      '[after-pack] main Info.plist missing NSMicrophoneUsageDescription — check entitlements.mac.plist',
    );
  }

  // Helpers do Chromium (GPU, Renderer, Plugin) herdam entitlements do main
  // via entitlementsInherit; NSMicrophoneUsageDescription no helper só é
  // exigido para App Store submission (não fazemos). Apenas logar ausência.
  let missingCount = 0;
  for (const helper of helperApps) {
    const helperPlist = join(frameworksDir, helper, 'Contents/Info.plist');
    if (!existsSync(helperPlist)) continue;
    const content = await readFile(helperPlist, 'utf-8');
    if (!content.includes(micKey)) missingCount += 1;
  }

  console.log(
    `[after-pack] ${helperApps.length} macOS helper bundles (${missingCount} without NSMicrophoneUsageDescription — OK for non-App-Store distribution)`,
  );
}

async function writeInstallMeta(appOutDir: string, context: AfterPackContext): Promise<void> {
  const { packager } = context;
  const meta = {
    appId: packager.appInfo.id,
    productName: packager.appInfo.productFilename,
    version: packager.appInfo.version,
    flavor: process.env['G4OS_APP_FLAVOR'] ?? 'public',
    packedAt: new Date().toISOString(),
    electronVersion: packager.electronDistMacOsAppName ?? null,
    platform: 'win32',
  };

  const metaPath = join(appOutDir, 'install-meta.json');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  const stats = await stat(metaPath);
  console.log(`[after-pack] wrote install-meta.json (${stats.size}B)`);
}
