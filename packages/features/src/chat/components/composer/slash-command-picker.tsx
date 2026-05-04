/**
 * SlashCommandPicker — popover ancorado ao composer com lista de slash
 * commands quando o usuário digita `/` no início. Espelha estrutura do
 * `MentionPicker` (combobox no textarea, listbox no popover, ARIA via
 * `aria-controls`/`aria-activedescendant`, navegação Arrow/Enter/Esc).
 *
 * V1 reference: `apps/electron/src/renderer/components/ui/slash-command-menu.tsx`.
 *
 * Selecionar substitui `/query` por `command` + espaço (parser do
 * backend trata `/setup`, `/clear` etc. como markers especiais).
 */

import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { Slash } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from 'react';

export interface SlashCommandSpec {
  /** Comando completo incluindo `/` (ex.: `/setup`, `/compact`). */
  readonly command: string;
  /** Label curto pra mostrar acima da descrição. */
  readonly label: string;
  /** Descrição opcional do que o command faz. Plain string (não-traduzida). */
  readonly description?: string;
  /**
   * CR-18 F-F2: catálogos exportados pra UI devem usar `*Key: TranslationKey`
   * (CLAUDE.md "Padrões obrigatórios → i18n via labelKey"). Quando presente,
   * o renderer prioriza esta chave via `t()` em vez de `description`.
   */
  readonly descriptionKey?: TranslationKey;
}

export interface SlashCommandPickerProps {
  readonly commands: readonly SlashCommandSpec[];
  readonly query: string;
  readonly onSelect: (command: string) => void;
  readonly onCancel: () => void;
  readonly registerKeyHandler?: (handler: (event: KeyboardEvent) => boolean) => () => void;
  readonly listboxId?: string;
}

const MAX_ITEMS = 8;

export function SlashCommandPicker({
  commands,
  query,
  onSelect,
  onCancel,
  registerKeyHandler,
  listboxId: listboxIdProp,
}: SlashCommandPickerProps): ReactNode {
  const { t } = useTranslate();
  const [activeIndex, setActiveIndex] = useState(0);
  const reactId = useId();
  const listboxId = listboxIdProp ?? `slash-picker-listbox-${reactId}`;
  const optionIdPrefix = `slash-option-${reactId}`;

  const matches = useMemo(
    () => filterCommands(commands, query).slice(0, MAX_ITEMS),
    [commands, query],
  );

  // CR-18 F-F6: useEffect mount-only setActiveIndex(0) era no-op (initial
  // state já é 0). Removido — `useState(0)` cobre.

  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(Math.max(0, matches.length - 1));
  }, [matches, activeIndex]);

  useEffect(() => {
    if (!registerKeyHandler) return;
    return registerKeyHandler((event) =>
      dispatchSlashKey({ event, matches, activeIndex, setActiveIndex, onSelect, onCancel }),
    );
  }, [registerKeyHandler, matches, activeIndex, onSelect, onCancel]);

  if (matches.length === 0) {
    return (
      <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-lg border border-foreground/10 bg-background px-4 py-3 shadow-lg ring-1 ring-foreground/5">
        <p className="text-xs italic text-muted-foreground">
          {t('chat.slashCommand.empty', { query })}
        </p>
      </div>
    );
  }

  const activeOptionId = matches[activeIndex]
    ? `${optionIdPrefix}-${matches[activeIndex].command}`
    : undefined;

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-lg ring-1 ring-foreground/5">
      <div className="border-b border-foreground/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('chat.slashCommand.title')}
        </span>
      </div>
      <div
        id={listboxId}
        role="listbox"
        tabIndex={-1}
        aria-label={t('chat.slashCommand.title')}
        {...(activeOptionId ? { 'aria-activedescendant': activeOptionId } : {})}
        className="max-h-[240px] overflow-y-auto py-1"
      >
        {matches.map((cmd, index) => (
          <SlashRow
            key={cmd.command}
            id={`${optionIdPrefix}-${cmd.command}`}
            spec={cmd}
            active={index === activeIndex}
            onHover={() => setActiveIndex(index)}
            onSelect={() => onSelect(cmd.command)}
          />
        ))}
      </div>
    </div>
  );
}

interface SlashRowProps {
  readonly id: string;
  readonly spec: SlashCommandSpec;
  readonly active: boolean;
  readonly onHover: () => void;
  readonly onSelect: () => void;
}

function SlashRow({ id, spec, active, onHover, onSelect }: SlashRowProps): ReactNode {
  const { t } = useTranslate();
  // CR-18 F-F2: prioriza chave traduzida sobre `description` plain string.
  const description = spec.descriptionKey ? t(spec.descriptionKey) : spec.description;
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        active ? 'bg-accent/60' : 'hover:bg-accent/12'
      }`}
    >
      <Slash className="size-3.5 shrink-0 opacity-60" aria-hidden={true} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono font-semibold">{spec.command}</div>
        {description ? (
          <div className="truncate text-[10px] text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </button>
  );
}

interface DispatchKeyArgs {
  readonly event: KeyboardEvent;
  readonly matches: readonly SlashCommandSpec[];
  readonly activeIndex: number;
  readonly setActiveIndex: (updater: (i: number) => number) => void;
  readonly onSelect: (command: string) => void;
  readonly onCancel: () => void;
}

function dispatchSlashKey(args: DispatchKeyArgs): boolean {
  const { event, matches, activeIndex, setActiveIndex, onSelect, onCancel } = args;
  if (event.key === 'ArrowDown') {
    setActiveIndex((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
    return true;
  }
  if (event.key === 'ArrowUp') {
    setActiveIndex((i) => Math.max(0, i - 1));
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const chosen = matches[activeIndex];
    if (!chosen) return false;
    onSelect(chosen.command);
    return true;
  }
  if (event.key === 'Escape') {
    onCancel();
    return true;
  }
  return false;
}

function filterCommands(
  commands: readonly SlashCommandSpec[],
  query: string,
): readonly SlashCommandSpec[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return commands;
  return commands.filter(
    (c) =>
      c.command.toLowerCase().includes(normalized) || c.label.toLowerCase().includes(normalized),
  );
}

/**
 * Conjunto default de slash commands. Caller pode passar lista própria
 * pra adicionar/remover. V1 inclui mais (`/help`, `/feedback`, etc.) —
 * canary começa com 4 essenciais.
 */
export const DEFAULT_SLASH_COMMANDS: readonly SlashCommandSpec[] = [
  {
    command: '/setup',
    label: '/setup',
    descriptionKey: 'chat.slashCommand.setup.description',
  },
  {
    command: '/clear',
    label: '/clear',
    descriptionKey: 'chat.slashCommand.clear.description',
  },
  {
    command: '/compact',
    label: '/compact',
    descriptionKey: 'chat.slashCommand.compact.description',
  },
  {
    command: '/help',
    label: '/help',
    descriptionKey: 'chat.slashCommand.help.description',
  },
];
