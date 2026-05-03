/**
 * Persistência da config do Debug HUD em disco.
 *
 * Arquivo único `<appPaths.config>/debug-hud.json` com:
 *   - bounds (x/y/width/height) da janela
 *   - opacity
 *   - cards (ordem + visibility) — preenchido conforme cards sao adicionados
 *
 * Validação via Zod (F-CR31-4/F-CR31-6) — payload do IPC + JSON do disco
 * passam por `safeParse` antes de virar `HudPersistedState`. Persistência
 * via `writeAtomic` (F-CR31-5/ADR-0050) — write→fsync→rename evita
 * arquivo parcial em crash mid-write.
 *
 * Falha de leitura/escrita é best-effort: HUD continua funcional com
 * defaults; apenas perde a config persistida na sessao.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';
import { z } from 'zod';

const log = createLogger('debug-hud-state');
const FILE_NAME = 'debug-hud.json';

const HudWindowBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const HudCardEntrySchema = z.object({
  id: z.string().min(1),
  visible: z.boolean(),
});

export const HudPersistedStateSchema = z.object({
  bounds: HudWindowBoundsSchema,
  opacity: z.number().min(0).max(1),
  cards: z.array(HudCardEntrySchema),
});

export type HudPersistedState = z.infer<typeof HudPersistedStateSchema>;

export const HUD_DEFAULT_STATE: HudPersistedState = {
  bounds: { x: 50, y: 50, width: 380, height: 600 },
  opacity: 0.92,
  cards: [
    { id: 'memory', visible: true },
    { id: 'listeners', visible: true },
    { id: 'logs', visible: true },
  ],
};

export async function loadHudState(): Promise<HudPersistedState> {
  const path = filePath();
  if (!existsSync(path)) return HUD_DEFAULT_STATE;
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = HudPersistedStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log.warn(
        { path, issues: parsed.error.format() },
        'invalid debug-hud.json schema; using defaults',
      );
      return HUD_DEFAULT_STATE;
    }
    return parsed.data;
  } catch (cause) {
    log.warn({ err: cause, path }, 'failed to load debug-hud.json; using defaults');
    return HUD_DEFAULT_STATE;
  }
}

export async function saveHudState(state: HudPersistedState): Promise<void> {
  const path = filePath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
  } catch (cause) {
    log.warn({ err: cause, path }, 'failed to persist debug-hud.json');
  }
}

function filePath(): string {
  return join(getAppPaths().config, FILE_NAME);
}
