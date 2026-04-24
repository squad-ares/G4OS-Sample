import type { SourceCatalogItem } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { Check, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export interface CatalogItemProps {
  readonly item: SourceCatalogItem;
  readonly onEnable: () => void;
  readonly disabled?: boolean;
}

export function CatalogItemCard({ item, onEnable, disabled }: CatalogItemProps): ReactNode {
  const { t } = useTranslate();
  return (
    <li className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{item.displayName}</span>
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t(`sources.category.${item.category}` as TranslationKey)}
          </span>
          {item.authKind === 'oauth' && (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              {t('sources.badge.oauth')}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      </div>
      {item.isInstalled ? (
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
          <Check className="size-3.5" aria-hidden={true} />
          {t('sources.catalog.installed')}
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
    </li>
  );
}
