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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getHomeDir } from '@g4os/platform';
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
export async function detectV1Install(home: string = getHomeDir()): Promise<V1Install | null> {
  for (const dirName of V1_CANDIDATE_DIRS) {
    const path = join(home, dirName);
    // CR-18 F-M8: troca `existsSync(...) + readFile(...)` (TOCTOU race
    // se V1 estiver rodando e fechando o app durante o detect) por uma
    // tentativa única de read — ENOENT vira "skip" via readV1Version
    // returnando `{ found: false }`.
    const detectResult = await readV1Version(path);
    if (!detectResult.found) continue;
    const flavor: V1Flavor = dirName.includes('public') ? 'public' : 'internal';
    return { path, version: detectResult.version, flavor };
  }
  return null;
}

async function readV1Version(
  installPath: string,
): Promise<{ found: boolean; version: string | null }> {
  let raw: string;
  try {
    raw = await readFile(join(installPath, 'config.json'), 'utf-8');
  } catch (cause) {
    // ENOENT é o caso comum (V1 não instalado nesse path) — não é erro,
    // só sinal pra continuar pra próximo candidato.
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { found: false, version: null };
    // Permission denied / IO error: V1 existe mas não conseguimos ler.
    // Tratamos como "não encontrado" — plan emite warning genérico, user
    // pode tentar novamente após fechar o V1 ou rodar com privilégios.
    return { found: false, version: null };
  }
  try {
    const parsed = JSON.parse(raw) as V1Config;
    return {
      found: true,
      version: typeof parsed.version === 'string' ? parsed.version : null,
    };
  } catch {
    // Arquivo presente mas JSON malformado — V1 corrompido. Plan ainda
    // entra (path detectado), version=null sinaliza degradação.
    return { found: true, version: null };
  }
}
