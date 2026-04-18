import { join } from 'node:path';
import envPaths from 'env-paths';

const FLAVOR = process.env['G4OS_DISTRIBUTION_FLAVOR'] ?? 'public';
const APP_NAME = FLAVOR === 'g4' ? 'g4os-internal' : 'g4os';

// Single instance
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

export function getAppPaths(): AppPaths {
  return Object.freeze({
    config: paths.config,
    data: paths.data,
    cache: paths.cache,
    state: paths.temp,
    credentialsFile: join(paths.data, 'credentials.enc'),
    workspace: (id: string) => join(paths.data, 'workspaces', id),
    session: (wid: string, sid: string) => join(paths.data, 'workspaces', wid, 'sessions', sid),
    logs: paths.log,
  });
}
