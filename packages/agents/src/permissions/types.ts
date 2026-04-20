import type { SessionId } from '@g4os/kernel';

export type PermissionMode = 'allow-all' | 'ask' | 'safe';

export interface PermissionRequest {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly rationale?: string;
  readonly requestedAt: number;
}

export type PermissionScope = 'once' | 'session' | 'always';

export type PermissionDecision =
  | { readonly type: 'allow'; readonly scope: PermissionScope }
  | { readonly type: 'deny'; readonly reason?: string };

export interface PermissionUI {
  askPermission(request: PermissionRequest): Promise<PermissionDecision>;
}

export interface PermissionRememberStore {
  get(sessionId: SessionId, toolName: string): Promise<PermissionDecision | null>;
  set(sessionId: SessionId, toolName: string, decision: PermissionDecision): Promise<void>;
}

export interface PermissionResolver {
  resolve(request: PermissionRequest, mode: PermissionMode): Promise<PermissionDecision>;
}
