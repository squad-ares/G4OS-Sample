import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useTranslate,
} from '@g4os/ui';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ModelProvider, ModelSpec } from '../model-catalog.ts';
import { findModel, formatContextWindow, MODELS } from '../model-catalog.ts';

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  'pi-google': 'Google',
  'pi-openai': 'OpenAI',
};

interface ModelSelectorProps {
  readonly value: string;
  readonly onChange: (modelId: string) => void;
  readonly disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const selected = findModel(value);

  const grouped = MODELS.reduce<Record<ModelProvider, ModelSpec[]>>(
    (acc, m) => {
      const list = acc[m.provider] ?? [];
      acc[m.provider] = [...list, m];
      return acc;
    },
    {} as Record<ModelProvider, ModelSpec[]>,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={true}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1 text-xs"
          aria-label={t('chat.modelSelector.ariaLabel')}
        >
          {selected?.label ?? t('chat.modelSelector.placeholder')}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t('chat.modelSelector.searchPlaceholder')}
            className="h-8 text-xs"
          />
          <CommandList>
            {(Object.entries(grouped) as [ModelProvider, ModelSpec[]][]).map(
              ([provider, models]) => (
                <CommandGroup key={provider} heading={PROVIDER_LABELS[provider]}>
                  {models.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className="gap-2 text-xs"
                    >
                      <Check
                        className={`h-3 w-3 shrink-0 ${m.id === value ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <span className="flex-1">{m.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatContextWindow(m.contextWindow)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ),
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
