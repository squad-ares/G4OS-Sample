import type { SourceConfigView } from '@g4os/kernel/types';
import { cn, useTranslate } from '@g4os/ui';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useComposerState } from '../../hooks/use-composer-state.ts';
import { type MentionTrigger, useMentionTypeahead } from '../../hooks/use-mention-typeahead.ts';
import { useSlashTypeahead } from '../../hooks/use-slash-typeahead.ts';
import type { Attachment } from '../../types.ts';
import { AttachmentList, DropZone } from './attachments/index.ts';
import { ComposerActionBar, type ComposerAffordances } from './composer-action-bar.tsx';
import { ComposerTextarea, type ComposerTextareaRef } from './composer-textarea.tsx';
import type { DraftStore } from './draft-persistence.ts';
import { MentionPicker } from './mention-picker.tsx';
import {
  DEFAULT_SLASH_COMMANDS,
  SlashCommandPicker,
  type SlashCommandSpec,
} from './slash-command-picker.tsx';
import type { ComposerSubmitMode } from './submit-mode.ts';

export interface ComposerSendPayload {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
}

export type { ComposerAffordances } from './composer-action-bar.tsx';

/**
 * Composer principal do chat. Combina draft persistence, attachment list,
 * voice recording, mention typeahead, source/working-dir/mode pickers e
 * action bar.
 *
 * **ARIA combobox:** o `<textarea>` recebe
 * `role="combobox"` quando `mentionSources` é fornecido — papel
 * pertence ao input/textarea (que detém foco), nunca ao popover. Outras
 * decisões ARIA do composer:
 * - `aria-expanded` reflete `mentionActive` (popover visível).
 * - `aria-controls` aponta para o id do `<div role="listbox">` dentro
 *   do `MentionPicker`. O id é gerado via `useId()` aqui no
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
   * Quando passado, habilita typeahead `@source` no textarea.
   * Seleção insere marker plain-text `[source:slug] ` — backend já parseia
   * via `SourceIntentDetector`.
   */
  readonly mentionSources?: readonly SourceConfigView[];
  /**
   * Slash commands oferecidos quando o user digita `/` na primeira
   * posição do textarea. Default = `DEFAULT_SLASH_COMMANDS` (4 comandos
   * essenciais). Passe `[]` pra desabilitar.
   */
  readonly slashCommands?: readonly SlashCommandSpec[];
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
  slashCommands = DEFAULT_SLASH_COMMANDS,
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

  const slash = useSlashTypeahead({
    value: text,
    onChange: setText,
    textareaRef: elementRef,
  });
  const slashActive = Boolean(slashCommands.length > 0 && slash.trigger);
  // Id de listbox gerado aqui (e injetado no MentionPicker) para
  // garantir que `aria-controls` aponte para o id real do popover.
  // Composer injeta via prop; picker usava `useId()` interno antes →
  // mismatch silencioso quebrava ARIA combobox (multi-window unsafe).
  const mentionListboxId = useId();
  const slashListboxId = useId();
  // ARIA combobox aponta pra qualquer popover ativo. Slash tem precedência
  // sobre mention quando ambos pudessem coexistir (slash só dispara em
  // pos 0, então conflito real é raro).
  const activeListboxId = slashActive
    ? slashListboxId
    : mentionActive
      ? mentionListboxId
      : undefined;
  const comboboxAriaProps = {
    role: 'combobox' as const,
    ariaExpanded: slashActive || mentionActive,
    ariaControls: activeListboxId,
    ariaAutoComplete: 'list' as const,
  };

  const mentionKeyHandlerRef = useRef<((event: ReactKeyboardEvent) => boolean) | null>(null);
  const slashKeyHandlerRef = useRef<((event: ReactKeyboardEvent) => boolean) | null>(null);

  const handleCaptureKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (slashActive) return slashKeyHandlerRef.current?.(event) ?? false;
      if (mentionActive) return mentionKeyHandlerRef.current?.(event) ?? false;
      return false;
    },
    [mentionActive, slashActive],
  );

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

  const registerSlashKeyHandler = useCallback((handler: (event: ReactKeyboardEvent) => boolean) => {
    slashKeyHandlerRef.current = handler;
    return () => {
      if (slashKeyHandlerRef.current === handler) {
        slashKeyHandlerRef.current = null;
      }
    };
  }, []);

  const handleMentionSelect = useCallback(
    (slug: string) => {
      mention.replaceWith(`[source:${slug}]`);
    },
    [mention],
  );

  const handleSlashSelect = useCallback(
    (command: string) => {
      slash.replaceWith(command);
    },
    [slash],
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
          // Paridade V1 (`InputContainer.tsx:280`): rounded-[14px] (input
          // tem radius menor que bubble, que é 18px), shadow-middle, e
          // ring sutil ao focar em vez de mudar cor do border.
          'flex w-full flex-col rounded-[14px] border border-foreground/10 bg-background shadow-middle transition-all focus-within:ring-1 focus-within:ring-foreground/[0.12]',
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
          {mentionActive && mentionSources && mentionTriggerForUi && !slashActive && (
            <MentionPicker
              sources={mentionSources}
              query={mentionTriggerForUi.query}
              onSelect={handleMentionSelect}
              onCancel={mention.cancel}
              registerKeyHandler={registerMentionKeyHandler}
              listboxId={mentionListboxId}
            />
          )}
          {slashActive && slash.trigger && (
            <SlashCommandPicker
              commands={slashCommands}
              query={slash.trigger.query}
              onSelect={handleSlashSelect}
              onCancel={slash.cancel}
              registerKeyHandler={registerSlashKeyHandler}
              listboxId={slashListboxId}
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
