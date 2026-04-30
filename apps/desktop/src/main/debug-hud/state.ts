/**
 * Persistência da config do Debug HUD em disco.
 *
 * Arquivo único `<appPaths.config>/debug-hud.json` com:
 *   - bounds (x/y/width/height) da janela
 *   - opacity
 *   - cards (ordem + visibility) — preenchido conforme cards sao adicionados
 *
 * Falha de leitura/escrita é best-effort: HUD continua funcional com
 * defaults; apenas perde a config persistida na sessao.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';

const log = createLogger('debug-hud-state');
const FILE_NAME = 'debug-hud.json';

export interface HudWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HudCardEntry {
  readonly id: string;
  readonly visible: boolean;
}

export interface HudPersistedState {
  readonly bounds: HudWindowBounds;
  readonly opacity: number;
  readonly cards: readonly HudCardEntry[];
}

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
    const parsed = JSON.parse(raw) as Partial<HudPersistedState>;
    return {
      bounds: parsed.bounds ?? HUD_DEFAULT_STATE.bounds,
      opacity: parsed.opacity ?? HUD_DEFAULT_STATE.opacity,
      cards: parsed.cards ?? HUD_DEFAULT_STATE.cards,
    };
  } catch (cause) {
    log.warn({ err: cause, path }, 'failed to load debug-hud.json; using defaults');
    return HUD_DEFAULT_STATE;
  }
}

export async function saveHudState(state: HudPersistedState): Promise<void> {
  const path = filePath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  } catch (cause) {
    log.warn({ err: cause, path }, 'failed to persist debug-hud.json');
  }
}

function filePath(): string {
  return join(getAppPaths().config, FILE_NAME);
}
