import { useTranslate } from '@g4os/ui';
import { Paperclip } from 'lucide-react';
import { useRef } from 'react';
import type { Attachment } from '../../../types.ts';
import { filesToAttachments, validateAttachments } from './validate-attachment.ts';

interface PaperclipButtonProps {
  readonly existing: ReadonlyArray<Attachment>;
  readonly onAttach: (attachments: Attachment[]) => void;
  readonly onError?: (msg: string) => void;
  readonly disabled?: boolean;
}

export function PaperclipButton({ existing, onAttach, onError, disabled }: PaperclipButtonProps) {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const err = validateAttachments(arr, existing);
    if (err) {
      onError?.(err);
      e.target.value = '';
      return;
    }
    const attachments = await filesToAttachments(arr);
    onAttach(attachments);
    e.target.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple={true}
        className="sr-only"
        aria-hidden={true}
        onChange={handleChange}
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={t('chat.composer.attachFiles')}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </>
  );
}
