import { join } from 'node:path';
import envPaths from 'env-paths';
import { getAppName } from './platform-info.ts';

// CR-43 F-CR43-5: lazy-init do singleton de paths. Antes `getAppName()` e
// `envPaths()` rodavam no load-time do módulo — se `G4OS_DISTRIBUTION_FLAVOR`
// fosse setado depois do primeiro `import '@g4os/platform'` (ex.: após
// dotenv.config() no preflight, ou em workers Vitest que reutilizam módulos),
// o paths ficava travado com o valor do env no momento do import. Agora a
// inicialização ocorre na primeira chamada a `getAppPaths()`, garantindo que
// qualquer setter de env anterior é observado. Mesmo padrão que `_platformInfo`
// em `platform-info.ts`.
let _paths: ReturnType<typeof envPaths> | null = null;

function ensurePaths(): ReturnType<typeof envPaths> {
  if (!_paths) {
    // CR-23 F-CR23-3: APP_NAME via `getAppName()` — fonte única de FLAVOR+NAME.
    _paths = envPaths(getAppName(), { suffix: '' });
  }
  return _paths;
}

/**
 * Paths resolvidos via `env-paths` — localização varia por SO:
 *   Linux:   ~/.config/g4os/ (config), ~/.local/share/g4os/ (data)
 *   macOS:   ~/Library/Application Support/g4os/ (config e data)
 *   Windows: %APPDATA%/g4os/Config/ (config), %LOCALAPPDATA%/g4os/Data/ (data)
 *
 * Nunca hardcode esses paths — use `getAppPaths()` em todos os consumidores.
 */
export interface AppPaths {
  /** Diretório de configuração da aplicação (env-paths config). */
  config: string;
  /** Diretório de dados persistentes (env-paths data). */
  data: string;
  /** Diretório de cache descartável (env-paths cache). */
  cache: string;
  /** Diretório de estado de runtime (subdir de data — XDG_STATE_HOME emulado). */
  state: string;
  /** Arquivo de credenciais cifrado (dentro de data). */
  credentialsFile: string;
  /** Diretório raiz do workspace `id` (dentro de data/workspaces). */
  workspace(id: string): string;
  /** Diretório da sessão `sessionId` dentro do workspace `workspaceId`. */
  session(workspaceId: string, sessionId: string): string;
  /** Diretório de logs (env-paths log). */
  logs: string;
}

// Defesa em profundidade contra path traversal em IDs — os routers tRPC
// já validam UUIDs, mas helpers de path são chamados de muitos lugares;
// guard explícito impede regressão futura.
const ID_SAFE_RE = /^[a-zA-Z0-9_-]+$/;

function assertSafeId(id: string, kind: 'workspace' | 'session'): string {
  if (!ID_SAFE_RE.test(id) || id.length === 0 || id.length > 128) {
    throw new Error(`Invalid ${kind} id: contains unsafe characters or wrong length`);
  }
  return id;
}

export function getAppPaths(): AppPaths {
  const paths = ensurePaths();
  return Object.freeze({
    config: paths.config,
    data: paths.data,
    cache: paths.cache,
    // env-paths não expõe `state` em todos os SOs (XDG_STATE_HOME existe só
    // em Linux). Usamos `<data>/state` como diretório persistente para
    // arquivos de estado de runtime (locks, last-run, recovery hints) — em
    // contraste com `cache` (descartável) e `temp` (volátil pelo SO).
    state: join(paths.data, 'state'),
    credentialsFile: join(paths.data, 'credentials.enc'),
    workspace: (id: string) => join(paths.data, 'workspaces', assertSafeId(id, 'workspace')),
    session: (wid: string, sid: string) =>
      join(
        paths.data,
        'workspaces',
        assertSafeId(wid, 'workspace'),
        'sessions',
        assertSafeId(sid, 'session'),
      ),
    logs: paths.log,
  });
}
