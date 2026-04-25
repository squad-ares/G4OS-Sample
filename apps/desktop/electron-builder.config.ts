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
    // bundled runtimes — populado por scripts/bundle-runtimes antes do pack.
    // runtime/ só existirá quando bridge-mcp-server/session-mcp-server forem
    // adicionados ao V2; por enquanto é opcional.
    { from: 'dist/vendor', to: 'vendor', filter: ['**/*'] },
    // drizzle migrations — main/index.ts resolve process.resourcesPath/drizzle
    // em packaged. Sem isto, initDatabase crasha com ENOENT no readdirSync.
    { from: '../../packages/data/drizzle', to: 'drizzle', filter: ['**/*'] },
  ],

  asar: true,
  asarUnpack: ['**/node_modules/@parcel/watcher*/**'],

  npmRebuild: true,

  afterPack: './scripts/after-pack.ts',

  mac: {
    category: 'public.app-category.productivity',
    icon: 'resources/icon.icns',
    // hardenedRuntime exige Developer ID. Em ad-hoc, ligado causa crash
    // silencioso ao abrir. Ligamos só em `signed`.
    hardenedRuntime: macSignMode === 'signed',
    gatekeeperAssess: false,
    // Entitlements `com.apple.security.cs.*` só funcionam com Developer ID
    // — em ad-hoc, AMFI rejeita o launch (Code=-420). Usamos plist vazio
    // em ad-hoc; full plist só em signed (precisa de Developer ID + cert).
    entitlements:
      macSignMode === 'signed'
        ? 'resources/entitlements.mac.plist'
        : 'resources/entitlements.mac.adhoc.plist',
    entitlementsInherit:
      macSignMode === 'signed'
        ? 'resources/entitlements.mac.plist'
        : 'resources/entitlements.mac.adhoc.plist',
    // identidade ad-hoc: `-` sinaliza para codesign assinar localmente
    // sem Apple Developer ID. Usuário final precisa de right-click→Abrir
    // E rodar `xattr -cr` se o macOS marcou quarantine (download web).
    identity: macSignMode === 'signed' ? undefined : macSignMode === 'adhoc' ? '-' : null,
    notarize: false, // notarização via script separado, ver scripts/notarize-macos.ts
    extendInfo: {
      NSMicrophoneUsageDescription:
        'G4 OS precisa acessar o microfone para gravar áudio durante sessões de chat e reuniões.',
      NSCameraUsageDescription:
        'G4 OS pode acessar a câmera para chamadas de vídeo em sessões colaborativas.',
    },
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
    // electron-builder não assina — deixamos o installer sair unsigned e
    // chamamos signtool/smctl/azuresigntool via script próprio. SEMPRE
    // sha256-only; V1 sofreu dual-sign (sha1+sha256) dobrando custo em
    // KeyLocker.
    signAndEditExecutable: winSignProvider !== 'none',
    signtoolOptions: {
      publisherName: 'G4 Educação',
      signingHashAlgorithms: ['sha256'],
    },
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
    synopsis: 'G4 OS desktop',
    description: 'G4 OS — plataforma desktop para sessões AI colaborativas.',
    // executableName define o nome do binário no Linux + slug do .deb/.rpm.
    // artifactName força o filename final (sem `@g4os/` que vinha do package
    // name e quebrava o .deb porque `@` e `/` não são válidos em paths debian).
    executableName: 'g4os',
    artifactName: 'g4os-${version}-${arch}.${ext}',
    maintainer: 'G4 Educação <engenharia@g4educacao.com>',
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    // AppArmor profile distribuído como Resource do app — postinst copia
    // pra /etc/apparmor.d/ no install (precisa root, executado pelo dpkg).
    extraResources: [{ from: 'build/linux/apparmor/g4os', to: 'apparmor/g4os' }],
  },

  deb: {
    afterInstall: 'build/linux/deb/postinst',
    afterRemove: 'build/linux/deb/prerm',
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
    ],
  },

  rpm: {
    // fpm usa o productName ("G4 OS") como --name por default — rpmbuild
    // quebra ao escrever `G4 OS.spec` (espaço no path). Forçar nome
    // sem espaço via fpm passthrough.
    fpm: ['--name', 'g4os', '--rpm-summary', 'G4 OS desktop'],
    depends: ['libXScrnSaver', 'libnotify', 'libsecret', 'xdg-utils'],
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
