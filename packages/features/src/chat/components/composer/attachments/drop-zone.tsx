import { useTranslate } from '@g4os/ui';
import { type ReactNode, useState } from 'react';
import type { Attachment } from '../../../types.ts';
import { filesToAttachments, validateAttachments } from './validate-attachment.ts';

interface DropZoneProps {
  readonly existing: ReadonlyArray<Attachment>;
  readonly onAttach: (attachments: Attachment[]) => void;
  readonly onError?: (msg: string) => void;
  readonly children: ReactNode;
  readonly disabled?: boolean;
}

export function DropZone({ existing, onAttach, onError, children, disabled }: DropZoneProps) {
  const { t } = useTranslate();
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const err = validateAttachments(arr, existing);
    if (err) {
      // CR-37 F-CR37-2: traduz a mensagem de erro usando a chave discriminada.
      onError?.(t(err.key, err.params as Record<string, string | number>));
      return;
    }
    const attachments = await filesToAttachments(arr);
    onAttach(attachments);
  }

  return (
    <section
      className="relative"
      aria-label={t('chat.composer.dropZone.ariaLabel')}
      aria-disabled={disabled}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        await handleFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[18px] border-2 border-dashed border-foreground/40 bg-foreground/5">
          <span className="text-sm font-medium text-foreground">
            {t('chat.composer.dropZone.dropHint')}
          </span>
        </div>
      )}
    </section>
  );
}
