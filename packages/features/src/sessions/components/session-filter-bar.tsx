/**
 * Filter bar compacta para listar sessões. Os segmentos são:
 *  - Chips de lifecycle (active/archived/trash)
 *  - Toggles rápidos (pinned, starred, unread)
 *  - Input de texto
 *  - Botão Clear quando alguma flag não-default está ligada
 *
 * Componente controlado — o consumidor guarda os `SessionFilters`.
 */

import { Button, Input, useTranslate } from '@g4os/ui';
import { Pin, Star, X } from 'lucide-react';
import type { SessionFilters, SessionLifecycleGroup } from '../types.ts';
import { DEFAULT_SESSION_FILTERS } from '../types.ts';

export interface SessionFilterBarProps {
  readonly filters: SessionFilters;
  readonly onChange: (filters: SessionFilters) => void;
}

type LifecycleOption = {
  readonly value: SessionLifecycleGroup;
  readonly labelKey:
    | 'session.list.filter.all'
    | 'session.list.filter.archived'
    | 'session.list.filter.trash';
};

const LIFECYCLE_OPTIONS: readonly LifecycleOption[] = [
  { value: 'active', labelKey: 'session.list.filter.all' },
  { value: 'archived', labelKey: 'session.list.filter.archived' },
  { value: 'deleted', labelKey: 'session.list.filter.trash' },
];

export function SessionFilterBar({ filters, onChange }: SessionFilterBarProps) {
  const { t } = useTranslate();
  const hasActiveFilters =
    filters.lifecycle !== 'active' ||
    filters.labelIds.length > 0 ||
    filters.pinned !== undefined ||
    filters.starred !== undefined ||
    filters.unread !== undefined ||
    (filters.text !== undefined && filters.text.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {LIFECYCLE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filters.lifecycle === option.value ? 'default' : 'ghost'}
            onClick={() => onChange({ ...filters, lifecycle: option.value })}
          >
            {t(option.labelKey)}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden={true} />
        <FlagToggle
          active={filters.pinned === true}
          icon={<Pin className="size-4" aria-hidden={true} />}
          label={t('session.list.filter.pinned')}
          onClick={() => {
            const { pinned: _, ...rest } = filters;
            onChange(filters.pinned === true ? rest : { ...filters, pinned: true });
          }}
        />
        <FlagToggle
          active={filters.starred === true}
          icon={<Star className="size-4" aria-hidden={true} />}
          label={t('session.list.filter.starred')}
          onClick={() => {
            const { starred: _, ...rest } = filters;
            onChange(filters.starred === true ? rest : { ...filters, starred: true });
          }}
        />
        <FlagToggle
          active={filters.unread === true}
          icon={<span className="size-2 rounded-full bg-accent" aria-hidden={true} />}
          label={t('session.list.filter.unread')}
          onClick={() => {
            const { unread: _, ...rest } = filters;
            onChange(filters.unread === true ? rest : { ...filters, unread: true });
          }}
        />
        {hasActiveFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(DEFAULT_SESSION_FILTERS)}
            className="ml-auto gap-1"
          >
            <X className="size-3" aria-hidden={true} />
            {t('session.list.filter.clear')}
          </Button>
        ) : null}
      </div>
      <Input
        value={filters.text ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          if (next.length > 0) {
            onChange({ ...filters, text: next });
          } else {
            const { text: _, ...rest } = filters;
            onChange(rest);
          }
        }}
        placeholder={t('session.list.search.placeholder')}
      />
    </div>
  );
}

interface FlagToggleProps {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}

function FlagToggle({ active, icon, label, onClick }: FlagToggleProps) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      aria-pressed={active}
      className="gap-1.5"
    >
      {icon}
      {label}
    </Button>
  );
}
