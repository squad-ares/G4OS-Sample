import { join } from 'node:path';
import envPaths from 'env-paths';

// CR7-15: validação do FLAVOR pra evitar path traversal via env. Sem isso,
// `G4OS_DISTRIBUTION_FLAVOR='../../../etc'` se propagava para envPaths().
// Whitelist explícita: só os flavors conhecidos são aceitos. Default
// fallback `public` se valor inválido (com console.warn — sem logger
// disponível neste módulo de boot).
const RAW_FLAVOR = process.env['G4OS_DISTRIBUTION_FLAVOR'] ?? 'public';
const FLAVOR = /^[a-z0-9-]+$/.test(RAW_FLAVOR) ? RAW_FLAVOR : 'public';
const APP_NAME = FLAVOR === 'g4' ? 'g4os-internal' : 'g4os';

// Instância única reaproveitada entre módulos do main
const paths = envPaths(APP_NAME, { suffix: '' });

export interface AppPaths {
  /** ~/.config/g4os */
  config: string;
  /** ~/.local/share/g4os */
  data: string;
  /** ~/.cache/g4os */
  cache: string;
  /** ~/.local/state/g4os */
  state: string;
  /** ~/.g4os/credentials.enc */
  credentialsFile: string;
  /** ~/.g4os/workspaces/<id>/ */
  workspace(id: string): string;
  /** ~/.g4os/workspaces/<id>/sessions/<sessionId>/ */
  session(workspaceId: string, sessionId: string): string;
  /** ~/.g4os/logs/ */
  logs: string;
}

// CR9: defesa em profundidade contra path traversal em IDs. Os routers
// tRPC já validam workspaceId/sessionId como UUID v4, mas helpers de
// path são chamados de muitos lugares (services internas, scripts,
// migrations) — guard explícito impede regressão futura. UUID v4 sem
// hífens, com hífens ou base 36 cobre todos os geradores em uso.
const ID_SAFE_RE = /^[a-zA-Z0-9_-]+$/;

function assertSafeId(id: string, kind: 'workspace' | 'session'): string {
  if (!ID_SAFE_RE.test(id) || id.length === 0 || id.length > 128) {
    throw new Error(`Invalid ${kind} id: contains unsafe characters or wrong length`);
  }
  return id;
}

export function getAppPaths(): AppPaths {
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
