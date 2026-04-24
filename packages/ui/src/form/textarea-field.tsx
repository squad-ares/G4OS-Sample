import { useCallback, useEffect, useRef } from 'react';
import { type FieldValues, type UseControllerProps, useController } from 'react-hook-form';
import { cn } from '../libs/utils.ts';
import { FieldWrapper } from './field-wrapper.tsx';

export interface TextareaFieldProps<TForm extends FieldValues> extends UseControllerProps<TForm> {
  label?: string | undefined;
  description?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean;
  className?: string | undefined;
  textareaClassName?: string | undefined;
  required?: boolean | undefined;
  /** Número mínimo de linhas visíveis (default: 3) */
  minRows?: number | undefined;
  /** Número máximo de linhas antes de scroll (default: 10) */
  maxRows?: number | undefined;
}

/**
 * Textarea controlado com auto-resize entre minRows e maxRows.
 *
 * @example
 * <TextareaField control={control} name="bio" label="Biografia" minRows={3} maxRows={8} />
 */
export function TextareaField<TForm extends FieldValues>({
  name,
  control,
  rules,
  defaultValue,
  label,
  description,
  placeholder,
  disabled,
  className,
  textareaClassName,
  required,
  minRows = 3,
  maxRows = 10,
}: Readonly<TextareaFieldProps<TForm>>) {
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

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      field.ref(el);
      textareaRef.current = el;
    },
    [field.ref],
  );

  // Auto-resize
  useEffect(() => {
    // Explicit read allows Biome to consider field.value a correct exhaustive dependency
    void field.value;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = Number.parseInt(getComputedStyle(el).lineHeight, 10) || 20;
    const min = lineHeight * minRows;
    const max = lineHeight * maxRows;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
  }, [field.value, minRows, maxRows]);

  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      error={error?.message}
      required={required}
      className={className}
    >
      <textarea
        id={name}
        ref={setRef}
        name={field.name}
        value={field.value ?? ''}
        onBlur={field.onBlur}
        onChange={(e) => field.onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled || field.disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        rows={minRows}
        className={cn(
          'flex w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm shadow-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-none overflow-y-auto transition-[height]',
          error && 'border-destructive focus-visible:ring-destructive/30',
          textareaClassName,
        )}
      />
    </FieldWrapper>
  );
}
