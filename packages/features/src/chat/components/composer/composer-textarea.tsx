import { cn } from '@g4os/ui';
import { forwardRef, type KeyboardEvent, useEffect, useImperativeHandle, useRef } from 'react';
import { type ComposerSubmitMode, shouldInsertNewline, shouldSubmit } from './submit-mode.ts';

const DEFAULT_MIN_ROWS = 1;
const DEFAULT_MAX_ROWS = 10;

export interface ComposerTextareaRef {
  focus(): void;
  blur(): void;
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
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        blur: () => textareaRef.current?.blur(),
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
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        rows={minRows}
        spellCheck={true}
        className={cn(
          'w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    );
  },
);
