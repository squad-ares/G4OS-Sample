/**
 * Helpers extraídos de `workspaces.$workspaceId.sessions.$sessionId.tsx`
 * pra manter o route file abaixo do cap 500 LOC.
 */

import type { PermissionDecision } from '@g4os/features/chat';

export type WirePermissionDecision = 'allow_once' | 'allow_session' | 'allow_always' | 'deny';

export function mapPermissionDecision(decision: PermissionDecision): WirePermissionDecision {
  if (decision.type === 'deny') return 'deny';
  if (decision.scope === 'session') return 'allow_session';
  if (decision.scope === 'always') return 'allow_always';
  return 'allow_once';
}

export function formatSendError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(err);
}
