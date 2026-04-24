import { type ReactNode, useState } from 'react';
import type { PermissionDecision, PermissionRequest } from './permission-modal.tsx';
import { PermissionModal } from './permission-modal.tsx';

interface PermissionProviderProps {
  readonly children: ReactNode;
  readonly onDecide?: (requestId: string, decision: PermissionDecision) => void;
}

interface PermissionQueueEntry extends PermissionRequest {
  readonly resolve: (decision: PermissionDecision) => void;
}

const permissionQueue: PermissionQueueEntry[] = [];
let onQueueChange: (() => void) | null = null;

export function requestPermission(request: PermissionRequest): Promise<PermissionDecision> {
  return new Promise((resolve) => {
    permissionQueue.push({ ...request, resolve });
    onQueueChange?.();
  });
}

export function PermissionProvider({ children, onDecide }: PermissionProviderProps) {
  const [pending, setPending] = useState<PermissionQueueEntry[]>([]);

  onQueueChange = () => setPending([...permissionQueue]);

  function handleDecide(decision: PermissionDecision) {
    const entry = pending[0];
    if (!entry) return;

    const idx = permissionQueue.indexOf(entry);
    if (idx !== -1) permissionQueue.splice(idx, 1);

    entry.resolve(decision);
    onDecide?.(entry.id, decision);
    setPending([...permissionQueue]);
  }

  return (
    <>
      {children}
      {pending.length > 0 && pending[0] && (
        <PermissionModal
          request={pending[0]}
          pendingCount={pending.length}
          onDecide={handleDecide}
        />
      )}
    </>
  );
}
