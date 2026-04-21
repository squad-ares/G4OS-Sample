import { cn, useTranslate } from '@g4os/ui';
import { useCallback, useRef, useState } from 'react';
import { useComposerState } from '../../hooks/use-composer-state.ts';
import type { Attachment } from '../../types.ts';
import { AttachmentList, DropZone, PaperclipButton } from './attachments/index.ts';
import { ComposerTextarea, type ComposerTextareaRef } from './composer-textarea.tsx';
import type { DraftStore } from './draft-persistence.ts';
import { SendButton } from './send-button.tsx';
import type { ComposerSubmitMode } from './submit-mode.ts';
import { VoiceButton } from './voice-button.tsx';

export interface ComposerSendPayload {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
}

export interface ComposerProps {
  readonly sessionId: string;
  readonly onSend: (payload: ComposerSendPayload) => void | Promise<void>;
  readonly onStop?: () => void;
  readonly submitMode?: ComposerSubmitMode;
  readonly disabled?: boolean;
  readonly isProcessing?: boolean;
  readonly autoFocus?: boolean;
  readonly draftStore?: DraftStore;
  readonly placeholder?: string;
  readonly className?: string;
  readonly transcribe?: (audio: Uint8Array, mimeType: string) => Promise<string>;
}

export function Composer({
  sessionId,
  onSend,
  onStop,
  submitMode = 'enter',
  disabled,
  isProcessing,
  autoFocus = true,
  draftStore,
  placeholder,
  className,
  transcribe,
}: ComposerProps) {
  const { t } = useTranslate();
  const textareaRef = useRef<ComposerTextareaRef | null>(null);
  const { text, setText, reset, isPristine } = useComposerState({
    sessionId,
    ...(draftStore ? { draftStore } : {}),
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const canSend = !disabled && !isProcessing && (!isPristine || attachments.length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;
    const payload: ComposerSendPayload = { text: text.trim(), attachments };
    reset();
    setAttachments([]);
    setAttachError(null);
    await Promise.resolve(onSend(payload));
  }, [canSend, text, attachments, reset, onSend]);

  function addAttachments(incoming: Attachment[]) {
    setAttachError(null);
    setAttachments((prev) => [...prev, ...incoming]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const resolvedPlaceholder = placeholder ?? t('chat.composer.placeholder');
  const submitHint =
    submitMode === 'cmd-enter'
      ? t('chat.composer.submitHint.cmdEnter')
      : t('chat.composer.submitHint.enter');

  return (
    <DropZone
      existing={attachments}
      onAttach={addAttachments}
      onError={setAttachError}
      {...(disabled ? { disabled } : {})}
    >
      <div
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-2xl border border-foreground/10 bg-foreground-2 shadow-minimal focus-within:border-foreground/20',
          disabled && 'opacity-70',
          className,
        )}
      >
        <AttachmentList attachments={attachments} onRemove={removeAttachment} />

        {attachError && (
          <p className="px-3 pt-1 text-xs text-destructive" role="alert">
            {attachError}
          </p>
        )}

        <div className="px-3 pt-2">
          <ComposerTextarea
            ref={textareaRef}
            value={text}
            onChange={setText}
            onSubmit={() => {
              void handleSubmit();
            }}
            submitMode={submitMode}
            placeholder={resolvedPlaceholder}
            ariaLabel={t('chat.composer.ariaLabel')}
            {...(disabled === undefined ? {} : { disabled })}
            autoFocus={autoFocus}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <div className="flex items-center gap-1">
            <PaperclipButton
              existing={attachments}
              onAttach={addAttachments}
              onError={setAttachError}
              {...(disabled ? { disabled } : {})}
            />
            {transcribe && (
              <VoiceButton
                transcribe={transcribe}
                onTranscript={(transcript) => setText(text ? `${text} ${transcript}` : transcript)}
                {...(disabled ? { disabled } : {})}
              />
            )}
            <span
              aria-live="polite"
              className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {submitHint}
            </span>
          </div>
          <SendButton
            onSend={() => {
              void handleSubmit();
            }}
            {...(onStop ? { onStop } : {})}
            disabled={!canSend}
            {...(isProcessing ? { isProcessing: true } : {})}
          />
        </div>
      </div>
    </DropZone>
  );
}
