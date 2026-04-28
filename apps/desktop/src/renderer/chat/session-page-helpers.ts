/**
 * Helpers extraídos de `workspaces.$workspaceId.sessions.$sessionId.tsx`
 * pra manter o route file abaixo do cap 500 LOC.
 */

import { type PermissionDecision, requestPermission } from '@g4os/features/chat';
import { toast } from '@g4os/ui';
import { trpc } from '../ipc/trpc-client.ts';

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

export interface PermissionRequiredEvent {
  readonly requestId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly inputJson: string;
}

export async function handlePermissionRequired(event: PermissionRequiredEvent): Promise<void> {
  let parsedInput: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.inputJson) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      parsedInput = parsed as Record<string, unknown>;
    }
  } catch {
    parsedInput = { raw: event.inputJson };
  }
  const decision = await requestPermission({
    id: event.toolUseId,
    toolName: event.toolName,
    input: parsedInput,
  });
  const wireDecision = mapPermissionDecision(decision);
  try {
    await trpc.sessions.respondPermission.mutate({
      requestId: event.requestId,
      decision: wireDecision,
    });
  } catch (err) {
    toast.error(String(err));
  }
}
