import type { Configuration } from 'electron-builder';

/**
 * electron-builder config tipada. Flags documentadas em ADR-0146.
 *
 * Signing/publish são opt-in: ausência de secret → build MVP válido
 * (ad-hoc/unsigned/skip), nunca falha.
 */

const APP_ID = process.env['G4OS_APP_ID'] ?? 'com.g4educacao.g4os';
const APP_NAME = process.env['G4OS_APP_NAME'] ?? 'G4 OS';

const macSignMode = (process.env['G4OS_MAC_SIGN_MODE'] ?? 'adhoc') as 'adhoc' | 'signed' | 'skip';

const winSignProvider = (process.env['WIN_SIGN_PROVIDER'] ?? 'none') as
  | 'none'
  | 'pfx'
  | 'keylocker'
  | 'azure'
  | 'auto';

const publishMode = (process.env['G4OS_PUBLISH_MODE'] ?? 'none') as 'r2' | 'github' | 'none';

const config: Configuration = {
  appId: APP_ID,
  productName: APP_NAME,
  copyright: `Copyright © ${new Date().getFullYear()} G4 Educação`,

  directories: {
    output: 'release/${version}',
    buildResources: 'resources',
  },

  files: [
    'out/**/*',
    'package.json',
    '!**/*.{ts,tsx,map}',
    '!**/__tests__/**',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
  ],

  extraResources: [
    { from: 'resources', to: 'resources', filter: ['icon.*', 'g4os-logos/**/*'] },
    // bundled runtimes — populado por scripts/bundle-runtimes antes do pack
    { from: 'dist/runtime', to: 'runtime', filter: ['**/*'] },
    { from: 'dist/vendor', to: 'vendor', filter: ['**/*'] },
  ],

  asar: true,
  asarUnpack: [
    // native bindings que precisam ficar fora do asar
    '**/node_modules/@parcel/watcher*/**',
  ],

  npmRebuild: true,

  afterPack: './scripts/after-pack.ts',

  mac: {
    category: 'public.app-category.productivity',
    icon: 'resources/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    // identidade ad-hoc: `-` sinaliza para codesign assinar localmente
    // sem Apple Developer ID. Usuário final precisa de right-click→Abrir.
    identity: macSignMode === 'signed' ? undefined : macSignMode === 'adhoc' ? '-' : null,
    notarize: false, // notarização via script separado, ver scripts/notarize-macos.ts
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
  },

  dmg: {
    icon: 'resources/icon.icns',
    background: 'resources/dmg-background.tiff',
  },

  win: {
    icon: 'resources/icon.ico',
    publisherName: 'G4 Educação',
    // SEMPRE sha256-only. V1 sofreu dual-sign (sha1+sha256) que dobra custo
    // em KeyLocker. Signing é post-build via scripts/sign-windows.ts.
    signingHashAlgorithms: ['sha256'],
    // electron-builder não assina — deixamos o installer sair unsigned e
    // chamamos signtool/smctl/azuresigntool via script próprio.
    signAndEditExecutable: winSignProvider !== 'none',
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },

  linux: {
    icon: 'resources/g4os-logos/g4os_app_icon.png',
    category: 'Office',
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
  },

  publish:
    publishMode === 'r2'
      ? [
          {
            provider: 's3',
            endpoint: process.env['R2_ENDPOINT']!,
            bucket: process.env['R2_BUCKET'] ?? 'g4os-releases',
            path: '${channel}/${os}/${arch}',
            region: 'auto',
          },
        ]
      : publishMode === 'github'
        ? [{ provider: 'github', releaseType: 'release' }]
        : null,
};

export default config;
