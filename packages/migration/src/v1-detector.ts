/**
 * Detector de install V1 — varre `homedir()` por `.g4os` ou `.g4os-public`.
 *
 * V1 marker é o `config.json` na raiz; sem ele consideramos diretório
 * inválido (talvez de uma instalação cancelada). Lê `version` mas tolera
 * ausência (V1 muito antigo pode não ter), preservando `null`.
 *
 * NUNCA modifica o V1 — só lê. Toda mudança é feita pelo executor com
 * backup explícito.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { V1_CANDIDATE_DIRS, type V1Flavor, type V1Install } from './types.ts';

interface V1Config {
  readonly version?: unknown;
}

/**
 * Procura V1 install em `homedir()` por candidatos pré-conhecidos.
 * Retorna o primeiro match — V1 nunca conviveu com 2 installs no mesmo
 * usuário (flavors diferentes usam paths distintos `.g4os` vs `.g4os-public`,
 * mas só um foi instalado por máquina na prática).
 *
 * Detector aceita override de `home` pra facilitar testes (sandbox tmpdir).
 */
export async function detectV1Install(home: string = homedir()): Promise<V1Install | null> {
  for (const dirName of V1_CANDIDATE_DIRS) {
    const path = join(home, dirName);
    if (!existsSync(join(path, 'config.json'))) continue;

    const version = await readV1Version(path);
    const flavor: V1Flavor = dirName.includes('public') ? 'public' : 'internal';
    return { path, version, flavor };
  }
  return null;
}

async function readV1Version(installPath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(installPath, 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as V1Config;
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    // Arquivo presente (passou o existsSync) mas malformado — V1 corrompido.
    // Retornamos null pro plan emitir warning ao invés de crashar.
    return null;
  }
}
