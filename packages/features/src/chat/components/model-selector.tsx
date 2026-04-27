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

const PROVIDER_ORDER: readonly ModelProvider[] = ['claude', 'pi-openai', 'pi-google', 'codex'];

interface ModelSelectorProps {
  readonly value: string;
  readonly onChange: (modelId: string) => void;
  readonly disabled?: boolean;
  readonly availableProviders?: readonly ModelProvider[];
}

export function ModelSelector({
  value,
  onChange,
  disabled,
  availableProviders,
}: ModelSelectorProps) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const selected = findModel(value);
  const allowAll = availableProviders === undefined;
  const allowed = new Set(availableProviders ?? []);
  const isAvailable = (provider: ModelProvider) => allowAll || allowed.has(provider);

  const grouped = PROVIDER_ORDER.map((provider) => ({
    provider,
    models: MODELS.filter((m) => m.provider === provider),
  })).filter((group) => group.models.length > 0);

  const handleSelect = (modelId: string, enabled: boolean) => {
    if (!enabled) return;
    onChange(modelId);
    setOpen(false);
  };

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
          {selected ? t(selected.labelKey) : t('chat.modelSelector.placeholder')}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 overflow-hidden p-0 shadow-lg ring-1 ring-foreground/10"
        align="start"
        sideOffset={6}
      >
        <Command className="bg-background" shouldFilter={true}>
          <CommandList className="max-h-[320px] min-h-[240px] py-1">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              {t('chat.modelSelector.empty')}
            </CommandEmpty>
            {grouped.map(({ provider, models }) => (
              <CommandGroup
                key={provider}
                heading={PROVIDER_LABELS[provider]}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {models.map((m) => (
                  <ModelRow
                    key={m.id}
                    model={m}
                    enabled={isAvailable(m.provider)}
                    active={m.id === value}
                    onSelect={() => handleSelect(m.id, isAvailable(m.provider))}
                    unavailableLabel={t('chat.modelSelector.unavailable')}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t border-foreground/10 bg-foreground/[0.02]">
            <CommandInput
              placeholder={t('chat.modelSelector.searchPlaceholder')}
              className="h-9 border-0 text-xs"
            />
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ModelRowProps {
  readonly model: ModelSpec;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly unavailableLabel: string;
}

function ModelRow({ model, enabled, active, onSelect, unavailableLabel }: ModelRowProps) {
  const { t } = useTranslate();
  const label = t(model.labelKey);
  return (
    <CommandItem
      value={`${model.provider} ${label} ${model.id}`}
      disabled={!enabled}
      onSelect={onSelect}
      onClick={onSelect}
      className="mx-1 my-0.5 gap-2 rounded-md px-2.5 py-2 text-xs data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent/60 aria-selected:bg-accent/60"
    >
      <Check
        className={`h-3.5 w-3.5 shrink-0 text-accent ${active ? 'opacity-100' : 'opacity-0'}`}
      />
      <span className="flex-1 truncate">{label}</span>
      {enabled ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatContextWindow(model.contextWindow)}
        </span>
      ) : (
        <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] italic text-muted-foreground">
          {unavailableLabel}
        </span>
      )}
    </CommandItem>
  );
}
