import { cn, useTranslate } from '@g4os/ui';
import { File, FileText, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Attachment } from '../../../types.ts';

interface AttachmentPreviewProps {
  readonly attachment: Attachment;
  readonly onRemove: () => void;
}

function useObjectUrl(data: Uint8Array, mimeType: string): string {
  return useMemo(() => {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    return url;
  }, [data, mimeType]);
}

function ImagePreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const url = useObjectUrl(attachment.data, attachment.mimeType);
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-lg border border-foreground/10">
      <img src={url} alt={attachment.name} className="h-full w-full object-cover" />
      <RemoveButton onRemove={onRemove} />
    </div>
  );
}

function FilePreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const isPdf = attachment.mimeType === 'application/pdf';
  const Icon = isPdf ? FileText : File;
  return (
    <div className="group relative flex h-16 w-32 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-foreground/10 bg-foreground/5 px-2">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">
        {attachment.name}
      </span>
      <RemoveButton onRemove={onRemove} />
    </div>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useTranslate();
  return (
    <button
      type="button"
      onClick={onRemove}
      className="absolute right-0.5 top-0.5 hidden rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background group-hover:flex"
      aria-label={t('chat.composer.removeAttachment')}
    >
      <X className="h-2.5 w-2.5" />
    </button>
  );
}

export function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  if (attachment.mimeType.startsWith('image/')) {
    return <ImagePreview attachment={attachment} onRemove={onRemove} />;
  }
  return <FilePreview attachment={attachment} onRemove={onRemove} />;
}

interface AttachmentListProps {
  readonly attachments: ReadonlyArray<Attachment>;
  readonly onRemove: (id: string) => void;
  readonly className?: string;
}

export function AttachmentList({ attachments, onRemove, className }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2 px-3 pt-2', className)}>
      {attachments.map((a) => (
        <AttachmentPreview key={a.id} attachment={a} onRemove={() => onRemove(a.id)} />
      ))}
    </div>
  );
}
