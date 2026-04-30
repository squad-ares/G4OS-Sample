import { writeFileSync } from 'node:fs';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('main');

export function registerStartupCrashHandlers(startup: Promise<void>): void {
  void startup.catch((err: unknown) => {
    writeStartupCrashLog('startup-error', err);
    log.fatal({ err }, 'fatal startup error');
    // Além do exit, mostrar dialog Electron para o usuário saber
    // o que aconteceu — antes app saía silenciosamente e o usuário ficava
    // com tela branca sem entender. `dialog.showErrorBox` é síncrono e
    // funciona mesmo antes de `app.whenReady()`.
    void showFatalDialog(err);
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    writeStartupCrashLog('uncaught', err);
    void showFatalDialog(err);
    process.exit(1);
  });
}

async function showFatalDialog(err: unknown): Promise<void> {
  try {
    // Import dinâmico — startup-crash-log roda muito cedo, antes do
    // composition root; importar `electron` no top-level explode em
    // unit tests ou em runtimes não-Electron.
    const specifier = 'electron';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      dialog?: { showErrorBox: (title: string, content: string) => void };
    };
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    mod.dialog?.showErrorBox(
      'G4OS — fatal startup error',
      `${message}\n\nDetails were saved to your temp directory (g4os-startup-error.log).`,
    );
  } catch {
    // best-effort — se Electron dialog não disponível, log file basta.
  }
}

// Logger pre-pino em $TMPDIR/g4os-{label}.log
function writeStartupCrashLog(label: string, err: unknown): void {
  try {
    // biome-ignore lint/style/noProcessEnv: composition root
    const tmp = process.env['TMPDIR'] ?? '/tmp';
    const msg =
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
    writeFileSync(`${tmp}/g4os-${label}.log`, `[${new Date().toISOString()}] ${msg}\n`, {
      flag: 'a',
    });
  } catch {
    /* ignore */
  }
}
