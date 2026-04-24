import type { TranslationKey } from '@g4os/translate';
import { Button, Input, useTranslate } from '@g4os/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export interface ApiKeysPanelCredential {
  readonly key: string;
  readonly configured: boolean;
}

export interface ApiKeysPanelProps {
  readonly credentials: readonly ApiKeysPanelCredential[];
  readonly onSave: (key: string, value: string) => Promise<void>;
  readonly onClear: (key: string) => Promise<void>;
  readonly disabled?: boolean;
}

interface ProviderSlot {
  readonly key: string;
  readonly labelId: TranslationKey;
  readonly hintId: TranslationKey;
  readonly comingSoon?: boolean;
}

const PROVIDER_SLOTS: readonly ProviderSlot[] = [
  {
    key: 'anthropic_api_key',
    labelId: 'settings.apiKeys.providers.anthropic.label',
    hintId: 'settings.apiKeys.providers.anthropic.hint',
  },
  {
    key: 'openai_api_key',
    labelId: 'settings.apiKeys.providers.openai.label',
    hintId: 'settings.apiKeys.providers.openai.hint',
  },
  {
    key: 'google_api_key',
    labelId: 'settings.apiKeys.providers.google.label',
    hintId: 'settings.apiKeys.providers.google.hint',
  },
  {
    key: 'bedrock_access_key_id',
    labelId: 'settings.apiKeys.providers.bedrockAccess.label',
    hintId: 'settings.apiKeys.providers.bedrockAccess.hint',
    comingSoon: true,
  },
  {
    key: 'bedrock_secret_access_key',
    labelId: 'settings.apiKeys.providers.bedrockSecret.label',
    hintId: 'settings.apiKeys.providers.bedrockSecret.hint',
    comingSoon: true,
  },
];

export function ApiKeysPanel({
  credentials,
  onSave,
  onClear,
  disabled,
}: ApiKeysPanelProps): ReactNode {
  const configured = new Set(credentials.map((c) => c.key));

  return (
    <div className="flex flex-col gap-3">
      {PROVIDER_SLOTS.map((slot) => (
        <ProviderRow
          key={slot.key}
          slot={slot}
          configured={configured.has(slot.key)}
          onSave={onSave}
          onClear={onClear}
          {...(disabled ? { disabled } : {})}
        />
      ))}
    </div>
  );
}

interface ProviderRowProps {
  readonly slot: ProviderSlot;
  readonly configured: boolean;
  readonly onSave: (key: string, value: string) => Promise<void>;
  readonly onClear: (key: string) => Promise<void>;
  readonly disabled?: boolean;
}

function ProviderRow({ slot, configured, onSave, onClear, disabled }: ProviderRowProps): ReactNode {
  const { t } = useTranslate();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue('');
  }, []);

  const handleSave = async () => {
    if (!value.trim() || disabled) return;
    setBusy(true);
    try {
      await onSave(slot.key, value.trim());
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      await onClear(slot.key);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const rowDisabled = disabled || busy || slot.comingSoon === true;

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {configured ? (
            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden={true} />
          ) : (
            <Circle className="size-4 text-foreground/30" aria-hidden={true} />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t(slot.labelId)}</span>
            <span className="text-[11px] text-muted-foreground">{t(slot.hintId)}</span>
          </div>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          {configured
            ? t('settings.apiKeys.status.configured')
            : t('settings.apiKeys.status.notConfigured')}
        </span>
      </div>
      {slot.comingSoon ? (
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          {t('settings.apiKeys.providers.comingSoon')}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={configured ? t('settings.apiKeys.actions.placeholderSet') : t(slot.hintId)}
          disabled={rowDisabled}
          className="h-8 flex-1"
        />
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleSave()}
          disabled={rowDisabled || !value.trim()}
        >
          {t('settings.apiKeys.actions.save')}
        </Button>
        {configured && !slot.comingSoon ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleClear()}
            disabled={disabled || busy}
          >
            {t('settings.apiKeys.actions.clear')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
