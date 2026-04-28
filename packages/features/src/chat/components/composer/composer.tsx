import type { SourceConfigView } from '@g4os/kernel/types';
import { cn, useTranslate } from '@g4os/ui';
import { ChevronDown, Folder, LayoutGrid, Users } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useComposerState } from '../../hooks/use-composer-state.ts';
import { type MentionTrigger, useMentionTypeahead } from '../../hooks/use-mention-typeahead.ts';
import type { Attachment } from '../../types.ts';
import { AttachmentList, DropZone, PaperclipButton } from './attachments/index.ts';
import { ComposerTextarea, type ComposerTextareaRef } from './composer-textarea.tsx';
import type { DraftStore } from './draft-persistence.ts';
import { MentionPicker } from './mention-picker.tsx';
import { SendButton } from './send-button.tsx';
import type { ComposerSubmitMode } from './submit-mode.ts';
import { VoiceButton } from './voice-button.tsx';

export interface ComposerSendPayload {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
}

export interface ComposerAffordances {
  readonly sourceLabel?: string;
  readonly onOpenSourcePicker?: () => void;
  readonly sourcePicker?: ReactNode;
  readonly workingDirLabel?: string;
  readonly onOpenWorkingDir?: () => void;
  readonly workingDirPicker?: ReactNode;
  readonly modeLabel?: string;
  readonly onOpenModePicker?: () => void;
  readonly modelSelector?: ReactNode;
  readonly thinkingSelector?: ReactNode;
  readonly partnersLabel?: string;
  readonly onOpenPartners?: () => void;
  readonly extras?: ReactNode;
}

/**
 * Composer principal do chat. Combina draft persistence, attachment list,
 * voice recording, mention typeahead, source/working-dir/mode pickers e
 * action bar.
 *
 * **ARIA combobox (CR3-11 + CR5-21):** o `<textarea>` recebe
 * `role="combobox"` quando `mentionSources` é fornecido — papel
 * pertence ao input/textarea (que detém foco), nunca ao popover. Outras
 * decisões ARIA do composer:
 * - `aria-expanded` reflete `mentionActive` (popover visível).
 * - `aria-controls` aponta para o id do `<div role="listbox">` dentro
 *   do `MentionPicker`. CR7 fix: id é gerado via `useId()` aqui no
 *   Composer e injetado no MentionPicker, garantindo que aria-controls
 *   case com o id real do listbox (multi-window safe).
 * - `aria-autocomplete="list"` indica autocomplete via popover (vs.
 *   `inline` que substituiria texto inline ou `both` que faz ambos).
 * - Keyboard nav (Arrow/Enter/Esc) é delegada ao `MentionPicker` via
 *   `handleCaptureKeyDown` que retorna `true` quando o evento foi
 *   consumido — evita submit acidental do composer.
 */
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
  readonly affordances?: ComposerAffordances;
  /**
   * OUTLIER-20: quando passado, habilita typeahead `@source` no textarea.
   * Seleção insere marker plain-text `[source:slug] ` — backend já parseia
   * via `SourceIntentDetector`.
   */
  readonly mentionSources?: readonly SourceConfigView[];
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
  affordances,
  mentionSources,
}: ComposerProps) {
  const { t } = useTranslate();
  const textareaRef = useRef<ComposerTextareaRef | null>(null);
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const { text, setText, reset, isPristine } = useComposerState({
    sessionId,
    ...(draftStore ? { draftStore } : {}),
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const mention = useMentionTypeahead({
    value: text,
    onChange: setText,
    textareaRef: elementRef,
  });
  const mentionActive = Boolean(mentionSources && mention.trigger);
  // CR7 fix: id de listbox gerado aqui (e injetado no MentionPicker) para
  // garantir que `aria-controls` aponte para o id real do popover. Antes:
  // composer hardcoded `'mention-picker-listbox'`, picker usava `useId()`
  // → mismatch silencioso quebrava ARIA combobox.
  const mentionListboxId = useId();
  const comboboxAriaProps = {
    role: 'combobox' as const,
    ariaExpanded: mentionActive,
    ariaControls: mentionActive ? mentionListboxId : undefined,
    ariaAutoComplete: 'list' as const,
  };

  const handleCaptureKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!mentionActive) return false;
      return mentionKeyHandlerRef.current?.(event) ?? false;
    },
    [mentionActive],
  );

  const mentionKeyHandlerRef = useRef<((event: ReactKeyboardEvent) => boolean) | null>(null);

  const registerMentionKeyHandler = useCallback(
    (handler: (event: ReactKeyboardEvent) => boolean) => {
      mentionKeyHandlerRef.current = handler;
      return () => {
        if (mentionKeyHandlerRef.current === handler) {
          mentionKeyHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const handleMentionSelect = useCallback(
    (slug: string) => {
      mention.replaceWith(`[source:${slug}]`);
    },
    [mention],
  );

  const mentionTriggerForUi = useMemo<MentionTrigger | null>(
    () => mention.trigger,
    [mention.trigger],
  );

  const canSend = !disabled && !isProcessing && (!isPristine || attachments.length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;
    const payload: ComposerSendPayload = { text: text.trim(), attachments };
    reset();
    setAttachments([]);
    setAttachError(null);
    await Promise.resolve(onSend(payload));
  }, [canSend, text, attachments, reset, onSend]);

  const addAttachments = (incoming: Attachment[]) => {
    setAttachError(null);
    setAttachments((prev) => [...prev, ...incoming]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleTranscript = (transcript: string) =>
    setText(text ? `${text} ${transcript}` : transcript);

  const resolvedPlaceholder = placeholder ?? t('chat.composer.placeholder');

  return (
    <DropZone
      existing={attachments}
      onAttach={addAttachments}
      onError={setAttachError}
      {...(disabled ? { disabled } : {})}
    >
      <div
        className={cn(
          // Paridade V1 (`FreeFormInput`): container com border-radius e
          // shadow `middle` (mais presente que o `minimal` anterior),
          // ring-foreground quando focused para destaque consistente.
          'flex w-full flex-col rounded-[18px] border border-foreground/10 bg-background shadow-middle transition-colors focus-within:border-foreground/30',
          disabled && 'opacity-70',
          className,
        )}
      >
        <AttachmentList attachments={attachments} onRemove={removeAttachment} />

        {attachError && (
          <p className="px-4 pt-2 text-xs text-destructive" role="alert">
            {attachError}
          </p>
        )}

        <div className="relative">
          <ComposerTextarea
            ref={(node) => {
              textareaRef.current = node;
              elementRef.current = node?.getElement() ?? null;
            }}
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
            onCaptureKeyDown={handleCaptureKeyDown}
            // ARIA combobox: papel pertence ao textarea (recebe foco), não ao
            // popover. CLAUDE.md "Padrões de UI" obriga essa estrutura para
            // typeahead. `aria-expanded` reflete o picker aberto, `aria-controls`
            // referencia o id do listbox dentro do MentionPicker.
            {...comboboxAriaProps}
          />
          {mentionActive && mentionSources && mentionTriggerForUi && (
            <MentionPicker
              sources={mentionSources}
              query={mentionTriggerForUi.query}
              onSelect={handleMentionSelect}
              onCancel={mention.cancel}
              registerKeyHandler={registerMentionKeyHandler}
              listboxId={mentionListboxId}
            />
          )}
        </div>

        <ComposerActionBar
          attachments={attachments}
          onAttach={addAttachments}
          onAttachError={setAttachError}
          onSubmit={() => void handleSubmit()}
          canSend={canSend}
          {...(affordances ? { affordances } : {})}
          {...(disabled ? { disabled } : {})}
          {...(isProcessing ? { isProcessing: true } : {})}
          {...(onStop ? { onStop } : {})}
          {...(transcribe ? { transcribe, onTranscript: handleTranscript } : {})}
        />
      </div>
    </DropZone>
  );
}

interface ComposerActionBarProps {
  readonly attachments: readonly Attachment[];
  readonly onAttach: (files: Attachment[]) => void;
  readonly onAttachError: (error: string | null) => void;
  readonly onSubmit: () => void;
  readonly canSend: boolean;
  readonly disabled?: boolean;
  readonly isProcessing?: boolean;
  readonly onStop?: () => void;
  readonly affordances?: ComposerAffordances;
  readonly transcribe?: (audio: Uint8Array, mimeType: string) => Promise<string>;
  readonly onTranscript?: (transcript: string) => void;
}

function ComposerActionBar({
  attachments,
  onAttach,
  onAttachError,
  onSubmit,
  canSend,
  disabled,
  isProcessing,
  onStop,
  affordances,
  transcribe,
  onTranscript,
}: ComposerActionBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.05] px-2.5 py-2">
      <LeftActionGroup
        attachments={attachments}
        onAttach={onAttach}
        onAttachError={onAttachError}
        {...(disabled ? { disabled } : {})}
        {...(affordances ? { affordances } : {})}
      />
      <RightActionGroup
        onSubmit={onSubmit}
        canSend={canSend}
        {...(disabled ? { disabled } : {})}
        {...(isProcessing ? { isProcessing: true } : {})}
        {...(onStop ? { onStop } : {})}
        {...(affordances ? { affordances } : {})}
        {...(transcribe && onTranscript ? { transcribe, onTranscript } : {})}
      />
    </div>
  );
}

function LeftActionGroup({
  attachments,
  onAttach,
  onAttachError,
  disabled,
  affordances,
}: {
  readonly attachments: readonly Attachment[];
  readonly onAttach: (files: Attachment[]) => void;
  readonly onAttachError: (error: string | null) => void;
  readonly disabled?: boolean;
  readonly affordances?: ComposerAffordances;
}) {
  const { t } = useTranslate();
  return (
    <div className="flex items-center gap-1">
      <PaperclipButton
        existing={attachments}
        onAttach={onAttach}
        onError={onAttachError}
        {...(disabled ? { disabled } : {})}
      />
      {affordances?.sourcePicker ??
        (affordances?.onOpenSourcePicker ? (
          <ComposerChipButton
            icon={<LayoutGrid className="size-3.5" aria-hidden={true} />}
            label={affordances.sourceLabel ?? t('chat.composer.chip.source')}
            onClick={affordances.onOpenSourcePicker}
            {...(disabled ? { disabled } : {})}
          />
        ) : null)}
      {affordances?.workingDirPicker ??
        (affordances?.onOpenWorkingDir ? (
          <ComposerChipButton
            icon={<Folder className="size-3.5" aria-hidden={true} />}
            label={affordances.workingDirLabel ?? 'main'}
            onClick={affordances.onOpenWorkingDir}
            {...(disabled ? { disabled } : {})}
          />
        ) : null)}
      {affordances?.extras}
    </div>
  );
}

function RightActionGroup({
  onSubmit,
  canSend,
  disabled,
  isProcessing,
  onStop,
  affordances,
  transcribe,
  onTranscript,
}: {
  readonly onSubmit: () => void;
  readonly canSend: boolean;
  readonly disabled?: boolean;
  readonly isProcessing?: boolean;
  readonly onStop?: () => void;
  readonly affordances?: ComposerAffordances;
  readonly transcribe?: (audio: Uint8Array, mimeType: string) => Promise<string>;
  readonly onTranscript?: (transcript: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <RightActionPickers
        {...(affordances ? { affordances } : {})}
        {...(disabled ? { disabled } : {})}
      />
      {transcribe && onTranscript ? (
        <VoiceButton
          transcribe={transcribe}
          onTranscript={onTranscript}
          {...(disabled ? { disabled } : {})}
        />
      ) : null}
      <SendButton
        onSend={onSubmit}
        {...(onStop ? { onStop } : {})}
        disabled={!canSend}
        {...(isProcessing ? { isProcessing: true } : {})}
      />
    </div>
  );
}

function RightActionPickers({
  affordances,
  disabled,
}: {
  readonly affordances?: ComposerAffordances;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslate();
  const showModeFallback = !affordances?.modelSelector && affordances?.onOpenModePicker;
  return (
    <>
      {affordances?.modelSelector ?? null}
      {affordances?.thinkingSelector ?? null}
      {showModeFallback ? (
        <ComposerChipButton
          label={affordances?.modeLabel ?? t('chat.composer.chip.mode')}
          onClick={affordances?.onOpenModePicker ?? (() => undefined)}
          trailing={<ChevronDown className="size-3 opacity-60" aria-hidden={true} />}
          {...(disabled ? { disabled } : {})}
        />
      ) : null}
      {affordances?.onOpenPartners ? (
        <ComposerChipButton
          icon={<Users className="size-3.5" aria-hidden={true} />}
          label={affordances.partnersLabel ?? t('chat.composer.chip.partners')}
          onClick={affordances.onOpenPartners}
          {...(disabled ? { disabled } : {})}
        />
      ) : null}
    </>
  );
}

interface ComposerChipButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly icon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly disabled?: boolean;
}

function ComposerChipButton({ label, onClick, icon, trailing, disabled }: ComposerChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 text-[11px] font-medium text-foreground/80 transition-colors enabled:hover:border-foreground/20 enabled:hover:bg-accent/12 enabled:hover:text-foreground disabled:opacity-50"
    >
      {icon}
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}
