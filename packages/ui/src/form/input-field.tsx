import { Eye, EyeOff } from 'lucide-react';
import type * as React from 'react';
import { useState } from 'react';
import { type FieldValues, type UseControllerProps, useController } from 'react-hook-form';
import { Input } from '../components/input.tsx';
import { cn } from '../libs/utils.ts';
import { useTranslate } from '../translate/translate-provider.tsx';
import { FieldWrapper } from './field-wrapper.tsx';

export interface InputFieldProps<TForm extends FieldValues> extends UseControllerProps<TForm> {
  /** Label visível acima do input */
  label?: string | undefined;
  /** Texto explicativo abaixo do label */
  description?: string | undefined;
  /** Placeholder do input */
  placeholder?: string | undefined;
  /** Tipo do input — 'password' ativa o toggle de visibilidade automático */
  type?: 'text' | 'email' | 'password' | 'url' | 'search' | 'number' | undefined;
  /** Desabilita o campo */
  disabled?: boolean;
  /** Ícone opcional à esquerda (Lucide, já importado pelo caller) */
  icon?: React.ReactNode | undefined;
  /** Classe adicional no container raiz */
  className?: string | undefined;
  /** Classe adicional no elemento <input> */
  inputClassName?: string | undefined;
  /** Indica campo obrigatório com * vermelho */
  required?: boolean | undefined;
  /** Valor para o atributo autocomplete do navegador (ex.: "email", "current-password") */
  autoComplete?: string | undefined;
}

/**
 * Campo de input controlado via react-hook-form.
 *
 * - Tipos: text, email, password, url, search, number
 * - Password: toggle de visibilidade automático (Eye/EyeOff)
 * - Integrado com FieldWrapper para label, description e erro
 * - Acessibilidade: aria-invalid + aria-describedby no erro
 *
 * @example — formulário de login
 * const { control } = useForm<LoginForm>();
 *
 * <InputField control={control} name="email" type="email" label="E-mail" required />
 * <InputField control={control} name="password" type="password" label="Senha" required />
 *
 * @example — campo com ícone
 * <InputField control={control} name="search" icon={<SearchIcon className="size-4" />} />
 */
export function InputField<TForm extends FieldValues>({
  name,
  control,
  rules,
  defaultValue,
  label,
  description,
  placeholder,
  type = 'text',
  disabled,
  icon,
  className,
  inputClassName,
  required,
  autoComplete,
}: Readonly<InputFieldProps<TForm>>) {
  const { t } = useTranslate();
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

  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;

  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      error={error?.message}
      required={required}
      className={className}
    >
      <span className="relative flex items-center">
        {/* Ícone esquerdo */}
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}

        <Input
          id={name}
          ref={field.ref}
          name={field.name}
          value={field.value ?? ''}
          onBlur={field.onBlur}
          onChange={(e) => {
            if (type === 'number') {
              const raw = e.target.value;
              field.onChange(raw === '' ? null : Number(raw));
            } else {
              field.onChange(e.target.value);
            }
          }}
          type={resolvedType}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled || field.disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className={cn(
            icon && 'pl-9',
            isPassword && 'pr-10',
            error && 'border-destructive focus-visible:ring-destructive/30',
            inputClassName,
          )}
        />

        {/* Toggle de senha */}
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? t('ui.password.hide') : t('ui.password.show')}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </span>
    </FieldWrapper>
  );
}
