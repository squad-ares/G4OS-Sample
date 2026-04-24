import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslate,
} from '@g4os/ui';
import type { ThinkingLevel } from '../model-catalog.ts';
import { findModel } from '../model-catalog.ts';

const LABELS: Record<ThinkingLevel, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

interface ThinkingLevelSelectorProps {
  readonly modelId: string;
  readonly value: ThinkingLevel;
  readonly onChange: (level: ThinkingLevel) => void;
  readonly disabled?: boolean;
}

export function ThinkingLevelSelector({
  modelId,
  value,
  onChange,
  disabled,
}: ThinkingLevelSelectorProps) {
  const { t } = useTranslate();
  const spec = findModel(modelId);
  if (!spec?.supportsThinking || !spec.thinkingLevels) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as ThinkingLevel)}
      {...(disabled ? { disabled } : {})}
    >
      <SelectTrigger className="h-7 w-28 text-xs" aria-label={t('chat.thinkingLevel.ariaLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {spec.thinkingLevels.map((level) => (
          <SelectItem key={level} value={level} className="text-xs">
            {LABELS[level]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
