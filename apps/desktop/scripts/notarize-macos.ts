#!/usr/bin/env tsx
/**
 * Notariza .app macOS via `xcrun notarytool` com retry em falhas
 * transitórias (Apple API devolve 500 ocasionalmente).
 *
 * Chamado APÓS sign-macos.sh quando G4OS_MAC_SIGN_MODE=signed.
 *
 * Flags (env):
 *   APPLE_ID                      Email da conta Apple Developer
 *   APPLE_ID_PASSWORD             App-specific password (não a senha real)
 *   APPLE_TEAM_ID                 10-char Team ID
 *   MAC_NOTARIZE_ATTEMPTS         Default 3
 *   MAC_NOTARIZE_RETRY_DELAY_SEC  Default 30
 *
 * Uso: tsx scripts/notarize-macos.ts <path/to/G4 OS.dmg|.zip|.app>
 */
import { execa } from 'execa';

const MAX_ATTEMPTS = Number.parseInt(process.env['MAC_NOTARIZE_ATTEMPTS'] ?? '3', 10);
const RETRY_DELAY_SEC = Number.parseInt(process.env['MAC_NOTARIZE_RETRY_DELAY_SEC'] ?? '30', 10);

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: notarize-macos.ts <path>');
    process.exit(1);
  }

  if (process.env['G4OS_MAC_SIGN_MODE'] === 'skip') {
    console.log('[notarize-macos] skip mode — not notarizing');
    return;
  }
  if (process.env['G4OS_MAC_SIGN_MODE'] === 'adhoc') {
    console.log('[notarize-macos] adhoc mode — skipping (no Apple Developer account)');
    return;
  }

  const appleId = mustEnv('APPLE_ID');
  const password = mustEnv('APPLE_ID_PASSWORD');
  const teamId = mustEnv('APPLE_TEAM_ID');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[notarize-macos] attempt ${attempt}/${MAX_ATTEMPTS}: ${target}`);
      await execa(
        'xcrun',
        [
          'notarytool',
          'submit',
          target,
          '--apple-id',
          appleId,
          '--password',
          password,
          '--team-id',
          teamId,
          '--wait',
        ],
        { stdio: 'inherit' },
      );

      // Staple — anexa ticket ao artefato para validação offline
      console.log('[notarize-macos] stapling');
      await execa('xcrun', ['stapler', 'staple', target], { stdio: 'inherit' });
      console.log('[notarize-macos] success');
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[notarize-macos] attempt ${attempt} failed: ${reason}`);
      if (attempt === MAX_ATTEMPTS) {
        console.error('[notarize-macos] gave up after max attempts');
        process.exit(1);
      }
      await sleep(RETRY_DELAY_SEC * 1000);
    }
  }
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[notarize-macos] missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('[notarize-macos] fatal:', err);
  process.exit(1);
});
