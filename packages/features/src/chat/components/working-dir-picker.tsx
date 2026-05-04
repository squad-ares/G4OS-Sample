import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useTranslate,
} from '@g4os/ui';
import { Check, ChevronDown, Folder } from 'lucide-react';
import { useState } from 'react';

export interface WorkingDirOption {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly kind: 'workspace-main' | 'project' | 'custom';
}

export interface WorkingDirPickerProps {
  readonly value: string | null;
  readonly options: readonly WorkingDirOption[];
  readonly onSelect: (path: string | null) => void;
  readonly onPickCustom?: () => Promise<string | null>;
  readonly disabled?: boolean;
}

/**
 * Picker do diretório de trabalho ativo da sessão. Exibe opções:
 *   - `workspace-main` — sempre primeiro; `path` do workspace root
 *   - `project` — roots de projetos conhecidos no workspace
 *   - `custom` — abre file dialog via `onPickCustom` para escolher qualquer
 *     caminho; o path escolhido vira a seleção ativa
 *
 * Display: quando `value === null`, mostra o label do primeiro item (main).
 * Quando `value` bate com uma opção, mostra o label dela. Caso contrário,
 * mostra o último segmento do path (custom path escolhido anteriormente).
 */
export function WorkingDirPicker({
  value,
  options,
  onSelect,
  onPickCustom,
  disabled,
}: WorkingDirPickerProps) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);

  const activeLabel = resolveActiveLabel(
    value,
    options,
    t('chat.workingDir.custom'),
    t('chat.composer.workingDir.defaultLabel'),
  );

  const handleSelect = (option: WorkingDirOption) => {
    setOpen(false);
    if (option.kind === 'workspace-main') {
      onSelect(null);
      return;
    }
    onSelect(option.path);
  };

  const handleCustom = async () => {
    setOpen(false);
    if (!onPickCustom) return;
    const picked = await onPickCustom();
    if (picked) onSelect(picked);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={true}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1 text-xs"
          aria-label={t('chat.workingDir.ariaLabel')}
        >
          <Folder className="size-3.5" aria-hidden={true} />
          <span className="max-w-[180px] truncate">{activeLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 overflow-hidden p-0 shadow-lg ring-1 ring-foreground/10"
        align="start"
        sideOffset={6}
      >
        <Command className="bg-background" shouldFilter={true}>
          <CommandList className="max-h-[320px] min-h-[200px] py-1">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              {t('chat.workingDir.empty')}
            </CommandEmpty>
            <CommandGroup
              heading={t('chat.workingDir.group.workspace')}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {options
                .filter((o) => o.kind !== 'project')
                .map((o) => (
                  <Row
                    key={o.id}
                    option={o}
                    active={isActive(o, value)}
                    onSelect={() => handleSelect(o)}
                  />
                ))}
            </CommandGroup>
            {options.some((o) => o.kind === 'project') && (
              <CommandGroup
                heading={t('chat.workingDir.group.projects')}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {options
                  .filter((o) => o.kind === 'project')
                  .map((o) => (
                    <Row
                      key={o.id}
                      option={o}
                      active={isActive(o, value)}
                      onSelect={() => handleSelect(o)}
                    />
                  ))}
              </CommandGroup>
            )}
            {onPickCustom && (
              <CommandGroup
                heading={t('chat.workingDir.group.custom')}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                <CommandItem
                  value="browse-custom"
                  onSelect={() => void handleCustom()}
                  onClick={() => void handleCustom()}
                  className="mx-1 my-0.5 gap-2 rounded-md px-2.5 py-2 text-xs aria-selected:bg-accent/60"
                >
                  <Folder className="size-3.5 shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{t('chat.workingDir.browse')}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          <div className="border-t border-foreground/10 bg-foreground/[0.02]">
            <CommandInput
              placeholder={t('chat.workingDir.searchPlaceholder')}
              className="h-9 border-0 text-xs"
            />
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface RowProps {
  readonly option: WorkingDirOption;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function Row({ option, active, onSelect }: RowProps) {
  return (
    <CommandItem
      value={`${option.kind} ${option.label} ${option.path}`}
      onSelect={onSelect}
      onClick={onSelect}
      className="mx-1 my-0.5 gap-2 rounded-md px-2.5 py-2 text-xs aria-selected:bg-accent/60"
    >
      <Check
        className={`h-3.5 w-3.5 shrink-0 text-accent ${active ? 'opacity-100' : 'opacity-0'}`}
      />
      <span className="flex-1 truncate">{option.label}</span>
      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
        {lastSegment(option.path)}
      </span>
    </CommandItem>
  );
}

function lastSegment(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function isActive(option: WorkingDirOption, value: string | null): boolean {
  if (option.kind === 'workspace-main') return value === null;
  return option.path === value;
}

function resolveActiveLabel(
  value: string | null,
  options: readonly WorkingDirOption[],
  customLabel: string,
  defaultLabel: string,
): string {
  if (value === null) {
    const main = options.find((o) => o.kind === 'workspace-main');
    return main?.label ?? defaultLabel;
  }
  const match = options.find((o) => o.path === value);
  if (match) return match.label;
  return `${customLabel} · ${lastSegment(value)}`;
}
