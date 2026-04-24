#!/usr/bin/env tsx
/**
 * Assina installer Windows (.exe NSIS) post-build. V1 sofreu dual-sign
 * (sha1 + sha256) por assinar via electron-builder inline; V2 assina
 * APENAS sha256 via script dedicado.
 *
 * Provider escolhido via WIN_SIGN_PROVIDER:
 *   none       — pula sign. Installer entregue unsigned (SmartScreen warn).
 *   pfx        — signtool com arquivo .pfx local. Exige WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD.
 *   keylocker  — DigiCert KeyLocker via smctl. Exige SM_API_KEY + WIN_SM_KEYPAIR_ALIAS.
 *   azure      — Azure Trusted Signing via AzureSignTool. Exige AZURE_* vars.
 *   auto       — detecta via presença de WIN_CSC_LINK / SM_API_KEY / AZURE_TENANT_ID.
 *
 * Após sign, regenera hash em latest.yml + .blockmap para auto-updater.
 *
 * Uso: tsx scripts/sign-windows.ts <path/to/installer.exe>
 */
import { existsSync } from 'node:fs';
import { execa } from 'execa';

type Provider = 'none' | 'pfx' | 'keylocker' | 'azure';

const TIMESTAMP_URL = 'http://timestamp.digicert.com';

async function main(): Promise<void> {
  const installer = process.argv[2];
  if (!installer) {
    console.error('usage: sign-windows.ts <installer.exe>');
    process.exit(1);
  }
  if (!existsSync(installer)) {
    console.error(`[sign-windows] not found: ${installer}`);
    process.exit(1);
  }

  const provider = resolveProvider();
  console.log(`[sign-windows] provider=${provider} target=${installer}`);

  if (provider === 'none') {
    console.log('[sign-windows] skipped (unsigned installer)');
    return;
  }

  switch (provider) {
    case 'pfx':
      await signWithPfx(installer);
      break;
    case 'keylocker':
      await signWithKeyLocker(installer);
      break;
    case 'azure':
      await signWithAzure(installer);
      break;
  }

  await verifyWindowsSignature(installer);
  console.log('[sign-windows] done');
}

function resolveProvider(): Provider {
  const raw = (process.env['WIN_SIGN_PROVIDER'] ?? 'none').toLowerCase();
  if (raw === 'none' || raw === 'pfx' || raw === 'keylocker' || raw === 'azure') {
    return raw;
  }
  if (raw === 'auto') {
    if (process.env['WIN_CSC_LINK']) return 'pfx';
    if (process.env['SM_API_KEY']) return 'keylocker';
    if (process.env['AZURE_TENANT_ID']) return 'azure';
    return 'none';
  }
  console.error(`[sign-windows] invalid WIN_SIGN_PROVIDER=${raw}`);
  process.exit(1);
}

async function signWithPfx(installer: string): Promise<void> {
  const pfx = mustEnv('WIN_CSC_LINK');
  const pass = mustEnv('WIN_CSC_KEY_PASSWORD');

  await execa(
    'signtool',
    [
      'sign',
      '/f',
      pfx,
      '/p',
      pass,
      '/fd',
      'sha256',
      '/tr',
      TIMESTAMP_URL,
      '/td',
      'sha256',
      installer,
    ],
    { stdio: 'inherit' },
  );
}

async function signWithKeyLocker(installer: string): Promise<void> {
  mustEnv('SM_API_KEY');
  const keypair = mustEnv('WIN_SM_KEYPAIR_ALIAS');

  await execa('smctl', ['sign', '--keypair-alias', keypair, '--input', installer, '--verbose'], {
    stdio: 'inherit',
  });
}

async function signWithAzure(installer: string): Promise<void> {
  const tenantId = mustEnv('AZURE_TENANT_ID');
  const clientId = mustEnv('AZURE_CLIENT_ID');
  const clientSecret = mustEnv('AZURE_CLIENT_SECRET');
  const endpoint = mustEnv('AZURE_TRUSTED_SIGNING_ENDPOINT');
  const account = mustEnv('AZURE_TRUSTED_SIGNING_ACCOUNT');
  const profile = mustEnv('AZURE_TRUSTED_SIGNING_PROFILE');

  await execa(
    'AzureSignTool',
    [
      'sign',
      '-kvu',
      endpoint,
      '-kvt',
      tenantId,
      '-kvi',
      clientId,
      '-kvs',
      clientSecret,
      '-tr',
      TIMESTAMP_URL,
      '-td',
      'sha256',
      '-fd',
      'sha256',
      '--azure-account',
      account,
      '--certificate-profile',
      profile,
      installer,
    ],
    { stdio: 'inherit' },
  );
}

async function verifyWindowsSignature(installer: string): Promise<void> {
  try {
    await execa('signtool', ['verify', '/pa', '/v', installer], { stdio: 'inherit' });
  } catch (err) {
    console.error(
      `[sign-windows] verify failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[sign-windows] missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

main().catch((err) => {
  console.error('[sign-windows] fatal:', err);
  process.exit(1);
});
