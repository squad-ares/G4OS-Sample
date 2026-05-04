import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PermissionDecision, PermissionRequest } from './permission-modal.tsx';
import { PermissionModal } from './permission-modal.tsx';

interface PermissionProviderProps {
  readonly children: ReactNode;
  readonly onDecide?: (requestId: string, decision: PermissionDecision) => void;
}

interface PermissionQueueEntry extends PermissionRequest {
  readonly resolve: (decision: PermissionDecision) => void;
}

interface PermissionContextValue {
  readonly request: (req: PermissionRequest) => Promise<PermissionDecision>;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

/**
 * Hook que dispara o modal de permissão e resolve com a decisão do
 * usuário. Substitui o state global em escopo de módulo (que quebrava
 * em multi-window e tinha race em React 19 strict mode).
 *
 * Uso típico:
 *   const { request } = usePermissionRequest();
 *   const decision = await request({ id, toolName, input });
 */
export function usePermissionRequest(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error('usePermissionRequest deve ser usado dentro de <PermissionProvider>');
  }
  return ctx;
}

/**
 * Backwards-compatible: caller que tem acesso ao Provider via React tree
 * pode chamar `requestPermission()` da mesma maneira anterior. Internamente
 * delega ao Context, evitando o state em escopo de módulo.
 *
 * Caller que NÃO tem React context (ex: fora de Provider) recebe Promise
 * que rejeita imediatamente — antes era silently queued para sempre.
 */
let activeBridge: ((req: PermissionRequest) => Promise<PermissionDecision>) | null = null;

export function requestPermission(request: PermissionRequest): Promise<PermissionDecision> {
  if (!activeBridge) {
    return Promise.reject(new Error('requestPermission chamado sem PermissionProvider montado'));
  }
  return activeBridge(request);
}

export function PermissionProvider({ children, onDecide }: PermissionProviderProps) {
  const [pending, setPending] = useState<ReadonlyArray<PermissionQueueEntry>>([]);
  const queueRef = useRef<PermissionQueueEntry[]>([]);

  const enqueue = useCallback((req: PermissionRequest): Promise<PermissionDecision> => {
    return new Promise<PermissionDecision>((resolve) => {
      const entry: PermissionQueueEntry = { ...req, resolve };
      queueRef.current = [...queueRef.current, entry];
      setPending(queueRef.current);
    });
  }, []);

  // CR-37 F-CR37-7: mover bridge para useEffect com cleanup para evitar mutação
  // de estado de módulo durante render (viola React 19 strict mode).
  // Em multi-window: último Provider montado vira ativo; ao desmontar, limpa
  // somente se ainda for o bridge atual (evita limpar bridge do Provider irmão).
  useEffect(() => {
    activeBridge = enqueue;
    return () => {
      if (activeBridge === enqueue) {
        activeBridge = null;
      }
    };
  }, [enqueue]);

  const handleDecide = useCallback(
    (decision: PermissionDecision) => {
      const [head, ...rest] = queueRef.current;
      if (!head) return;
      queueRef.current = rest;
      setPending(rest);
      head.resolve(decision);
      onDecide?.(head.id, decision);
    },
    [onDecide],
  );

  const ctxValue = useMemo<PermissionContextValue>(() => ({ request: enqueue }), [enqueue]);

  return (
    <PermissionContext.Provider value={ctxValue}>
      {children}
      {pending.length > 0 && pending[0] && (
        <PermissionModal
          request={pending[0]}
          pendingCount={pending.length}
          onDecide={handleDecide}
        />
      )}
    </PermissionContext.Provider>
  );
}
