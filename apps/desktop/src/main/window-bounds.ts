/**
 * Persistência de bounds (x/y/width/height) por workspace. Extraído do
 * `window-manager.ts` pra manter o composition da janela sob 300 LOC
 * sem misturar I/O atômico com lifecycle.
 *
 * Atomic rename via `writeAtomic` (tmp+fsync+rename) — antes
 * `writeFile` direto deixava arquivo parcial em crash mid-write.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('window-bounds');

const DEFAULT_WIDTH = 1420;
const DEFAULT_HEIGHT = 900;

export interface WindowBounds {
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

export function statePath(stateDir: string, workspaceId: string): string {
  return join(stateDir, `${workspaceId}.json`);
}

export async function loadWindowBounds(
  stateDir: string,
  workspaceId: string,
): Promise<WindowBounds> {
  try {
    const raw = await readFile(statePath(stateDir, workspaceId), 'utf-8');
    const parsed = JSON.parse(raw) as WindowBounds;
    return {
      width: parsed.width ?? DEFAULT_WIDTH,
      height: parsed.height ?? DEFAULT_HEIGHT,
      ...(parsed.x === undefined ? {} : { x: parsed.x }),
      ...(parsed.y === undefined ? {} : { y: parsed.y }),
    };
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

export async function saveWindowBounds(
  stateDir: string,
  workspaceId: string,
  bounds: { x: number; y: number; width: number; height: number },
): Promise<void> {
  try {
    const data: WindowBounds = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    };
    const path = statePath(stateDir, workspaceId);
    await mkdir(dirname(path), { recursive: true });
    await writeAtomic(path, JSON.stringify(data));
  } catch (err) {
    log.warn({ err, workspaceId }, 'failed to save window bounds');
  }
}
