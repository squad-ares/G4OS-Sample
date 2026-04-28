/**
 * Persistência de "última sessão visitada" por workspace, em localStorage.
 *
 * Motivador: V1 abria a sessão mais recente quando o usuário voltava pra aba
 * de Sessions; V2 (até este fix) mostrava um dashboard duplicando a
 * sub-sidebar. Esse helper permite o `sessions/index` route fazer o
 * redirect inteligente:
 *   1) última sessão visitada (se ainda existir e for da workspace ativa)
 *   2) sessão mais recente do workspace
 *   3) criar nova automaticamente
 *
 * Chave: `g4os.shell.lastSession.<workspaceId>`. localStorage é per-window
 * no Electron quando renderer roda em sandbox padrão — multi-window de
 * workspaces diferentes não compartilham, o que é o comportamento desejado.
 */

const PREFIX = 'g4os.shell.lastSession.';

function key(workspaceId: string): string {
  return `${PREFIX}${workspaceId}`;
}

export function getLastSessionId(workspaceId: string): string | null {
  if (typeof window === 'undefined' || !workspaceId) return null;
  try {
    const stored = window.localStorage.getItem(key(workspaceId));
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function setLastSessionId(workspaceId: string, sessionId: string): void {
  if (typeof window === 'undefined' || !workspaceId || !sessionId) return;
  try {
    window.localStorage.setItem(key(workspaceId), sessionId);
  } catch {
    // localStorage indisponível — degradação silenciosa.
  }
}

export function clearLastSessionId(workspaceId: string): void {
  if (typeof window === 'undefined' || !workspaceId) return;
  try {
    window.localStorage.removeItem(key(workspaceId));
  } catch {
    // idem
  }
}
