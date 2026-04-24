import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type FieldValues, type UseControllerProps, useController } from 'react-hook-form';
import { cn } from '../libs/utils.ts';
import { FieldWrapper } from './field-wrapper.tsx';

export interface OtpFieldProps<TForm extends FieldValues> extends UseControllerProps<TForm> {
  label?: string | undefined;
  description?: string | undefined;
  disabled?: boolean;
  /** Número de dígitos (default 6) */
  length?: number | undefined;
  /** Centralizar o label acima do campo */
  centerLabel?: boolean;
  /** Focar o primeiro dígito ao montar */
  autoFocus?: boolean;
  /** Disparado quando o código fica com `length` dígitos preenchidos */
  onComplete?: (value: string) => void;
  className?: string | undefined;
  slotClassName?: string | undefined;
  required?: boolean | undefined;
}

/**
 * Campo OTP multi-dígito controlado via react-hook-form.
 *
 * - Layout 3-3 separado por "-" para length par, ou único grupo caso contrário.
 * - Suporta paste, arrows, backspace, delete, home/end.
 * - `onComplete` dispara quando todos os dígitos estão preenchidos — útil para auto-submit.
 */
export function OtpField<TForm extends FieldValues>({
  name,
  control,
  rules,
  defaultValue,
  label,
  description,
  disabled,
  length = 6,
  centerLabel,
  autoFocus,
  onComplete,
  className,
  slotClassName,
  required,
}: Readonly<OtpFieldProps<TForm>>) {
  const controllerProps = {
    name,
    ...(control !== undefined && { control }),
    ...(rules !== undefined && { rules }),
    ...(defaultValue !== undefined && { defaultValue }),
  } as const;

  const {
    field,
    fieldState: { error },
  } = useController(controllerProps);

  const raw = typeof field.value === 'string' ? field.value : '';
  const normalized = useMemo(() => onlyDigits(raw).slice(0, length), [raw, length]);
  const slots = useMemo(
    () => Array.from({ length }, (_unused, i) => normalized[i] ?? ''),
    [length, normalized],
  );

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const setValue = useCallback(
    (next: string) => {
      const nextNormalized = onlyDigits(next).slice(0, length);
      field.onChange(nextNormalized);
      if (nextNormalized.length === length) onComplete?.(nextNormalized);
    },
    [field, length, onComplete],
  );

  const focusSlot = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(length - 1, index));
      const el = inputRefs.current[bounded];
      if (!el) return;
      el.focus();
      el.select();
    },
    [length],
  );

  useEffect(() => {
    if (autoFocus) focusSlot(0);
  }, [autoFocus, focusSlot]);

  const handleChange = (index: number, incoming: string) => {
    const digits = onlyDigits(incoming).slice(0, length);
    if (!digits) {
      const copy = slots.slice();
      copy[index] = '';
      setValue(copy.join(''));
      return;
    }
    const copy = slots.slice();
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= length) break;
      copy[cursor] = digit;
      cursor += 1;
    }
    setValue(copy.join(''));
    requestAnimationFrame(() => focusSlot(Math.min(index + digits.length, length - 1)));
  };

  const handleBackspace = (index: number) => {
    const copy = slots.slice();
    if (copy[index]) {
      copy[index] = '';
      setValue(copy.join(''));
      return;
    }
    if (index > 0) {
      copy[index - 1] = '';
      setValue(copy.join(''));
      requestAnimationFrame(() => focusSlot(index - 1));
    }
  };

  const handleDelete = (index: number) => {
    const copy = slots.slice();
    copy[index] = '';
    setValue(copy.join(''));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    const navKeyOffsets: Record<string, number | 'start' | 'end'> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: 'start',
      End: 'end',
    };
    const nav = navKeyOffsets[event.key];
    if (nav !== undefined) {
      event.preventDefault();
      if (nav === 'start') focusSlot(0);
      else if (nav === 'end') focusSlot(length - 1);
      else focusSlot(index + nav);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      handleBackspace(index);
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      handleDelete(index);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const digits = onlyDigits(event.clipboardData.getData('text')).slice(0, length);
    if (!digits) return;
    event.preventDefault();
    handleChange(index, digits);
  };

  const splitIndex = length % 2 === 0 ? length / 2 : Math.ceil(length / 2);

  const renderSlot = (slotIndex: number) => (
    <input
      key={slotIndex}
      ref={(el) => {
        inputRefs.current[slotIndex] = el;
        if (slotIndex === 0) field.ref(el);
      }}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete={slotIndex === 0 ? 'one-time-code' : 'off'}
      maxLength={length}
      value={slots[slotIndex] ?? ''}
      disabled={disabled || field.disabled}
      onBlur={field.onBlur}
      onChange={(e) => handleChange(slotIndex, e.target.value)}
      onKeyDown={(e) => handleKeyDown(e, slotIndex)}
      onPaste={(e) => handlePaste(e, slotIndex)}
      onFocus={(e) => e.currentTarget.select()}
      aria-label={`${label ?? name} ${slotIndex + 1}`}
      aria-invalid={error ? true : undefined}
      className={cn(
        'flex h-12 w-11 items-center justify-center rounded-[14px] border border-foreground/12 bg-background/82 text-center text-lg font-semibold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.36)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/28',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive focus-visible:ring-destructive/30',
        slotClassName,
      )}
    />
  );

  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      error={error?.message}
      required={required}
      className={cn(centerLabel && '[&>label]:self-center', className)}
    >
      <fieldset className="flex items-center justify-center gap-3 border-0 p-0">
        <legend className="sr-only">{label ?? name}</legend>
        <div className="flex items-center gap-2">
          {slots.slice(0, splitIndex).map((_unused, i) => renderSlot(i))}
        </div>
        <div aria-hidden={true} className="text-sm font-medium text-muted-foreground">
          –
        </div>
        <div className="flex items-center gap-2">
          {slots.slice(splitIndex).map((_unused, offset) => renderSlot(splitIndex + offset))}
        </div>
      </fieldset>
    </FieldWrapper>
  );
}

function onlyDigits(value: string): string {
  return value.replace(/\D/gu, '');
}
