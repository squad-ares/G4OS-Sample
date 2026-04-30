/**
 * PreferencesStore — settings globais do app persistidas em JSON.
 *
 * Diferente de `<workspace>/config.json` (preferências por-workspace) e do
 * vault (segredos), este é o lugar das preferences de _aplicação_:
 * coisas que afetam todo o app independente de workspace ou login.
 *
 * Atualmente carrega só `debug.hud.enabled`. Cresce
 * conforme novas preferences globais aparecem.
 *
 * Persistência: `<appPaths.config>/preferences.json` (atomic write via
 * `writeAtomic` do kernel — write→fsync→rename + dir fsync).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';
import { z } from 'zod';

const log = createLogger('preferences-store');
const FILE_NAME = 'preferences.json';

const PreferencesSchema = z.object({
  debug: z
    .object({
      hud: z
        .object({
          enabled: z.boolean(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export interface PreferencesStoreOptions {
  /**
   * Default `debug.hud.enabled` quando o arquivo não existe ou a chave
   * está ausente. Caller injeta com base em `app.isPackaged`:
   * - dev: `true` (HUD aparece por padrão)
   * - prod: `false` (usuário precisa habilitar via settings)
   */
  readonly defaultDebugHudEnabled: boolean;
}

export class PreferencesStore {
  private cached: Preferences | null = null;

  constructor(private readonly options: PreferencesStoreOptions) {}

  async getDebugHudEnabled(): Promise<boolean> {
    const prefs = await this.load();
    const persisted = prefs.debug?.hud?.enabled;
    return persisted ?? this.options.defaultDebugHudEnabled;
  }

  async setDebugHudEnabled(enabled: boolean): Promise<void> {
    const current = await this.load();
    const next: Preferences = {
      ...current,
      debug: {
        ...(current.debug ?? {}),
        hud: { enabled },
      },
    };
    await this.save(next);
  }

  private async load(): Promise<Preferences> {
    if (this.cached) return this.cached;
    const path = filePath();
    if (!existsSync(path)) {
      this.cached = {};
      return this.cached;
    }
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = PreferencesSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.cached = parsed.data;
        return this.cached;
      }
      log.warn(
        { issues: parsed.error.issues, path },
        'preferences.json malformed; using defaults until next save',
      );
      this.cached = {};
      return this.cached;
    } catch (cause) {
      log.warn({ err: cause, path }, 'failed to read preferences.json');
      this.cached = {};
      return this.cached;
    }
  }

  private async save(prefs: Preferences): Promise<void> {
    const path = filePath();
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeAtomic(path, `${JSON.stringify(prefs, null, 2)}\n`);
      this.cached = prefs;
    } catch (cause) {
      log.warn({ err: cause, path }, 'failed to write preferences.json');
      throw cause instanceof Error ? cause : new Error(String(cause));
    }
  }
}

function filePath(): string {
  return join(getAppPaths().config, FILE_NAME);
}
