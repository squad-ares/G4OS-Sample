import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useTranslate,
} from '@g4os/ui';
import { useEffect } from 'react';

export type PermissionScope = 'once' | 'session' | 'always';

export interface PermissionDecision {
  readonly type: 'allow' | 'deny';
  readonly scope?: PermissionScope;
}

export interface PermissionRequest {
  readonly id: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly rationale?: string;
}

interface PermissionModalProps {
  readonly request: PermissionRequest;
  readonly pendingCount: number;
  readonly onDecide: (decision: PermissionDecision) => void;
}

function ToolInputPreview({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  const preview = JSON.stringify(input, null, 2);
  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-3">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {toolName}
      </p>
      <pre className="overflow-x-auto font-mono text-[11px] text-foreground/80 whitespace-pre-wrap max-h-40">
        {preview}
      </pre>
    </div>
  );
}

export function PermissionModal({ request, pendingCount, onDecide }: PermissionModalProps) {
  const { t } = useTranslate();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'a') onDecide({ type: 'allow', scope: 'once' });
      if (e.key === 'd') onDecide({ type: 'deny' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecide]);

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.permission.title')}</DialogTitle>
          <DialogDescription>
            {t('chat.permission.description')}{' '}
            <strong className="font-semibold text-foreground">{request.toolName}</strong>.
            {pendingCount > 1 && (
              <span className="ml-1 text-muted-foreground">
                ({t('chat.permission.moreQueued', { count: pendingCount - 1 })})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ToolInputPreview toolName={request.toolName} input={request.input} />

        {request.rationale && (
          <p className="text-sm text-muted-foreground italic">{request.rationale}</p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => onDecide({ type: 'deny' })}
          >
            {t('chat.permission.deny')}{' '}
            <kbd className="ml-1 text-[10px] opacity-50">{t('chat.permission.shortcutDeny')}</kbd>
          </Button>
          <Button variant="outline" onClick={() => onDecide({ type: 'allow', scope: 'once' })}>
            {t('chat.permission.allowOnce')}{' '}
            <kbd className="ml-1 text-[10px] opacity-50">{t('chat.permission.shortcutAllow')}</kbd>
          </Button>
          <Button variant="outline" onClick={() => onDecide({ type: 'allow', scope: 'session' })}>
            {t('chat.permission.allowSession')}
          </Button>
          <Button onClick={() => onDecide({ type: 'allow', scope: 'always' })}>
            {t('chat.permission.alwaysAllow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
