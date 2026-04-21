import { type FieldValues, type UseControllerProps, useController } from 'react-hook-form';
import { Label } from '../components/label.tsx';
import { Switch } from '../components/switch.tsx';
import { cn } from '../libs/utils.ts';

export interface SwitchFieldProps<TForm extends FieldValues> extends UseControllerProps<TForm> {
  label: string;
  description?: string | undefined;
  disabled?: boolean;
  className?: string | undefined;
}

/**
 * Campo de toggle (Switch) controlado via react-hook-form.
 * Layout horizontal: toggle à direita, label + description à esquerda.
 *
 * @example
 * <SwitchField control={control} name="notifications" label="Notificações" description="Receber alertas por e-mail" />
 */
export function SwitchField<TForm extends FieldValues>({
  name,
  control,
  rules,
  defaultValue,
  label,
  description,
  disabled,
  className,
}: Readonly<SwitchFieldProps<TForm>>) {
  const { field } = useController({
    name,
    ...(control !== undefined && { control }),
    ...(rules !== undefined && { rules }),
    ...(defaultValue !== undefined && { defaultValue }),
  });

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5 flex-1">
        <Label htmlFor={name} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      <Switch
        id={name}
        ref={field.ref}
        checked={Boolean(field.value)}
        onCheckedChange={field.onChange}
        onBlur={field.onBlur}
        disabled={disabled || field.disabled}
      />
    </div>
  );
}
