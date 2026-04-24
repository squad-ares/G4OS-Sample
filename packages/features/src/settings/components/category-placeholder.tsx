import { useTranslate } from '@g4os/ui';
import type { SettingsCategory } from '../categories.ts';

export interface CategoryPlaceholderProps {
  readonly category: SettingsCategory;
}

export function CategoryPlaceholder({ category }: CategoryPlaceholderProps) {
  const { t } = useTranslate();
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{t(category.labelKey)}</p>
      <p className="mt-1">{t(category.descriptionKey)}</p>
      <p className="mt-3 inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
        {t('settings.category.plannedBadge')}
      </p>
    </div>
  );
}
