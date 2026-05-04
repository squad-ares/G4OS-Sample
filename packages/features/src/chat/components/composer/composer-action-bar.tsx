/**
 * Action bar do composer — extraída do `composer.tsx` pra manter o
 * componente principal sob 500 LOC. Conjunto de chips, pickers e botão
 * send/voice na linha inferior do composer.
 *
 * Sub-componentes (LeftActionGroup, RightActionGroup, RightActionPickers,
 * ComposerChipButton) ficam todos privados a este arquivo — só
 * `ComposerActionBar` é exportado.
 */

import { useTranslate } from '@g4os/ui';
import { ChevronDown, Folder, LayoutGrid, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Attachment } from '../../types.ts';
import { PaperclipButton } from './attachments/index.ts';
import { SendButton } from './send-button.tsx';
import { VoiceButton } from './voice-button.tsx';

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

export interface ComposerActionBarProps {
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

export function ComposerActionBar({
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
            label={affordances.workingDirLabel ?? t('chat.composer.workingDir.defaultLabel')}
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
