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
  /**
   * Browsers default `autoComplete` para `on` em textarea, o que pode poluir
   * UI de chat composer com sugestões de histórico. Default permanece nativo
   * (undefined → `on`); composer/forms passam `'off'` quando precisa.
   */
  autoComplete?: string | undefined;
  // ARIA combobox: quando o textarea funciona como typeahead (mention,
  // slash command, mention picker), o role pertence ao input/textarea —
  // não ao popover. CLAUDE.md V2 obriga essa estrutura.
  role?: 'textbox' | 'combobox' | undefined;
  ariaExpanded?: boolean | undefined;
  ariaControls?: string | undefined;
  ariaActiveDescendant?: string | undefined;
  ariaAutoComplete?: 'list' | 'inline' | 'both' | 'none' | undefined;
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
  autoComplete,
  role,
  ariaExpanded,
  ariaControls,
  ariaActiveDescendant,
  ariaAutoComplete,
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

  // F-CR49-12: deps vazias — RHF aceita chamar `field.ref(el)` diretamente;
  // `field.ref` pode trocar entre renders mas o setter RHF é estável de fato,
  // e incluí-lo na deps causava re-mount duplo no mesmo elemento.
  // biome-ignore lint/correctness/useExhaustiveDependencies: (reason: field.ref é estável dentro do ciclo RHF — incluir causaria double-mount no mesmo elemento)
  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    field.ref(el);
    textareaRef.current = el;
  }, []);

  // Auto-resize do textarea conforme conteúdo cresce.
  // F-CR49-11: `field.value` na lista de deps sem uso no body — elimina o
  // `void field.value` workaround frágil do original. Biome suprimido: é
  // um "reactive dep" legítimo (resize reativo a mudança de valor do campo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: (reason: field.value é dep reativa do resize — força re-execução ao digitar sem ser usado no body do effect)
  useEffect(() => {
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
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: (reason: aria-expanded/-controls/-activedescendant válidos quando role="combobox" é passado pelo caller — biome não infere role dinâmico via prop) */}
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
        autoComplete={autoComplete}
        role={role}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-activedescendant={ariaActiveDescendant}
        aria-autocomplete={ariaAutoComplete}
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
