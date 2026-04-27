import { cn } from '@g4os/ui';
import { forwardRef, type KeyboardEvent, useEffect, useImperativeHandle, useRef } from 'react';
import { type ComposerSubmitMode, shouldInsertNewline, shouldSubmit } from './submit-mode.ts';

// Paridade V1 (`FreeFormInput`): textarea começa em ~3 linhas (~76px de altura),
// não em 1 linha. Caller pode override via prop `minRows` quando precisar de
// composer compacto (ex.: edição inline).
const DEFAULT_MIN_ROWS = 3;
const DEFAULT_MAX_ROWS = 10;

export interface ComposerTextareaRef {
  focus(): void;
  blur(): void;
  /**
   * OUTLIER-20: acesso ao `<textarea>` nativo para ler `selectionStart` em
   * typeahead detection (MentionPicker). Retorna null antes de montar.
   */
  getElement(): HTMLTextAreaElement | null;
}

export interface ComposerTextareaProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly submitMode?: ComposerSubmitMode;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
  /** Captura de keydown ANTES do submit/newline — usado pelo MentionPicker
   *  para navegação (arrow/enter/esc). Handler retorna `true` se consumiu. */
  readonly onCaptureKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;

  // ARIA combobox props — quando providos, o textarea atua como combobox
  // ligado a um listbox externo (mention picker, slash commands, etc).
  // CLAUDE.md V2 obriga combobox no `<input>/<textarea>` que detém foco,
  // não no wrapper popover. Sem estes props, o screen reader nunca sabe
  // que o textarea está conectado ao listbox.
  readonly role?: 'textbox' | 'combobox';
  readonly ariaExpanded?: boolean;
  readonly ariaControls?: string;
  readonly ariaActiveDescendant?: string;
  readonly ariaAutoComplete?: 'list' | 'inline' | 'both' | 'none';
}

export const ComposerTextarea = forwardRef<ComposerTextareaRef, ComposerTextareaProps>(
  function ComposerTextarea(
    {
      value,
      onChange,
      onSubmit,
      submitMode = 'enter',
      placeholder,
      disabled,
      autoFocus,
      minRows = DEFAULT_MIN_ROWS,
      maxRows = DEFAULT_MAX_ROWS,
      className,
      ariaLabel,
      onCaptureKeyDown,
      role,
      ariaExpanded,
      ariaControls,
      ariaActiveDescendant,
      ariaAutoComplete,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        blur: () => textareaRef.current?.blur(),
        getElement: () => textareaRef.current,
      }),
      [],
    );

    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: (reason: `value` drives scrollHeight recalc after DOM update — removing it breaks auto-resize)
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const computed = window.getComputedStyle(el);
      const lineHeight = Number.parseFloat(computed.lineHeight || '20') || 20;
      const paddingY =
        Number.parseFloat(computed.paddingTop || '0') +
        Number.parseFloat(computed.paddingBottom || '0');
      const minHeight = lineHeight * minRows + paddingY;
      const maxHeight = lineHeight * maxRows + paddingY;
      const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
      el.style.height = `${nextHeight}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [value, minRows, maxRows]);

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Capture hook (mention picker) pode consumir Arrow/Enter/Esc antes
      // do submit. Se consumido, o evento para aqui.
      if (onCaptureKeyDown?.(event)) {
        event.preventDefault();
        return;
      }
      if (shouldSubmit(event, submitMode)) {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (shouldInsertNewline(event, submitMode)) {
        // default browser behavior handles the newline — no preventDefault
        return;
      }
    };

    return (
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: (reason: aria-expanded válido quando role="combobox" é passado pelo caller — biome não infere role dinâmico)
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        role={role}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-activedescendant={ariaActiveDescendant}
        aria-autocomplete={ariaAutoComplete}
        rows={minRows}
        spellCheck={true}
        className={cn(
          // Paridade V1: padding generoso (`pl-5 pr-4 pt-4 pb-3` no V1) +
          // line-height confortável. Composer-pai cuida do container/shadow.
          'w-full resize-none bg-transparent px-5 pt-4 pb-3 text-[15px] leading-[1.5] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    );
  },
);
