import type { SourceCatalogItem } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { Check, Clock3, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { SourceGlyph } from './source-glyph.tsx';

export interface CatalogItemProps {
  readonly item: SourceCatalogItem;
  readonly onEnable: () => void;
  readonly disabled?: boolean;
}

export function CatalogItemCard({ item, onEnable, disabled }: CatalogItemProps): ReactNode {
  const { t } = useTranslate();
  const isPendingRuntime = item.kind === 'managed' && item.authKind === 'oauth';
  const description = item.descriptionKey
    ? t(item.descriptionKey as TranslationKey)
    : item.description;
  return (
    <li className="flex min-h-[124px] flex-col gap-3 rounded-lg border border-foreground/10 bg-background px-4 py-3 transition-colors hover:border-foreground/20">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <SourceGlyph source={item} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{item.displayName}</span>
              {item.authKind === 'oauth' && (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  {t('sources.badge.oauth')}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t(`sources.category.${item.category}` as TranslationKey)}
        </span>
        {item.isInstalled ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <Check className="size-3.5" aria-hidden={true} />
            {t('sources.catalog.installed')}
          </span>
        ) : isPendingRuntime ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden={true} />
            {t('sources.catalog.comingSoon')}
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onEnable}
            disabled={disabled}
            className="gap-1"
          >
            <Plus className="size-3.5" aria-hidden={true} />
            {t('sources.catalog.enable')}
          </Button>
        )}
      </div>
    </li>
  );
}
