import { classifyForSafeMode } from './safe-allowlist.ts';
import type {
  PermissionDecision,
  PermissionMode,
  PermissionRememberStore,
  PermissionRequest,
  PermissionResolver,
  PermissionUI,
} from './types.ts';

export class DefaultPermissionResolver implements PermissionResolver {
  constructor(
    private readonly ui: PermissionUI,
    private readonly rememberStore: PermissionRememberStore,
  ) {}

  async resolve(request: PermissionRequest, mode: PermissionMode): Promise<PermissionDecision> {
    const remembered = await this.rememberStore.get(request.sessionId, request.toolName);
    if (remembered !== null) {
      return remembered;
    }
    if (mode === 'allow-all') {
      return { type: 'allow', scope: 'once' };
    }
    if (mode === 'safe') {
      const classification = classifyForSafeMode(request.toolName);
      if (classification === 'forbidden') {
        return { type: 'deny', reason: 'Tool not allowed in safe mode' };
      }
      if (classification === 'allowed') {
        return { type: 'allow', scope: 'once' };
      }
    }
    const decision = await this.ui.askPermission(request);
    if (decision.type === 'allow' && decision.scope !== 'once') {
      await this.rememberStore.set(request.sessionId, request.toolName, decision);
    }
    return decision;
  }
}
