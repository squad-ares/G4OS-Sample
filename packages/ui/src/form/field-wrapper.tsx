import type { ReactNode } from 'react';
import { Label } from '../components/label.tsx';
import { cn } from '../libs/utils.ts';

export interface FieldWrapperProps {
  /** Nome do campo — usado para htmlFor e data-testid */
  name: string;
  /** Label visível acima do campo */
  label?: string | undefined;
  /** Texto explicativo abaixo do label */
  description?: string | undefined;
  /** Mensagem de erro (do react-hook-form ou validação manual) */
  error?: string | undefined;
  /** Indica campo obrigatório com * vermelho */
  required?: boolean | undefined;
  /** Classe adicional no container raiz */
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Container base para campos de formulário.
 *
 * Responsável por: label, description, exibição de erro e acessibilidade.
 * Todos os campos controlados do G4OS devem usar este wrapper.
 *
 * @example
 * <FieldWrapper name="email" label="E-mail" error={errors.email?.message} required>
 *   <Input {...register('email')} />
 * </FieldWrapper>
 */
export function FieldWrapper({
  name,
  label,
  description,
  error,
  required,
  className,
  children,
}: Readonly<FieldWrapperProps>) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-testid={`field-${name}`}>
      {label && (
        <Label
          htmlFor={name}
          className={cn('text-xs font-semibold text-foreground/70', error && 'text-destructive')}
        >
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden={true}>
              *
            </span>
          )}
        </Label>
      )}

      {description && <p className="text-xs text-muted-foreground leading-snug">{description}</p>}

      {children}

      {/* CR5-13: spacer phantom removido. `gap-1.5` no container parent
          já cobre espaçamento; renderizar `<p aria-hidden>` em todos
          os campos era anti-idiomático e poluía o DOM em forms grandes
          (50 campos = 50 elementos extras). Layout shift inexistente
          porque `gap` colapsa para 0 quando o sibling some. */}
      {error ? (
        <p
          id={`${name}-error`}
          role="alert"
          aria-live="polite"
          className="text-xs text-destructive transition-opacity duration-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
