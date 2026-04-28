import type { SourceCatalogItem, SourceConfigView } from '@g4os/kernel/types';
import {
  AtSign,
  BriefcaseBusiness,
  CalendarDays,
  Cloud,
  FolderGit2,
  Github,
  HardDrive,
  KanbanSquare,
  type LucideIcon,
  Mail,
  MessageSquare,
  PlugZap,
  Table2,
} from 'lucide-react';
import type { ReactNode } from 'react';

type SourceLike = Pick<SourceCatalogItem | SourceConfigView, 'category' | 'displayName' | 'slug'>;

const CATEGORY_STYLE: Record<SourceLike['category'], string> = {
  google: 'bg-blue-500/12 text-blue-600 dark:text-blue-300',
  microsoft: 'bg-sky-500/12 text-sky-600 dark:text-sky-300',
  slack: 'bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300',
  dev: 'bg-zinc-500/12 text-zinc-700 dark:text-zinc-200',
  storage: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-200',
  crm: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  pm: 'bg-amber-500/12 text-amber-700 dark:text-amber-200',
  other: 'bg-foreground/8 text-foreground/75',
};

export function SourceGlyph({
  source,
  size = 'md',
}: {
  readonly source: SourceLike;
  readonly size?: 'sm' | 'md';
}): ReactNode {
  const Icon = sourceIcon(source);
  return (
    <span
      aria-hidden={true}
      className={`flex shrink-0 items-center justify-center rounded-md ${CATEGORY_STYLE[source.category]} ${
        size === 'sm' ? 'size-7' : 'size-9'
      }`}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
    </span>
  );
}

function sourceIcon(source: SourceLike): LucideIcon {
  const haystack = `${source.slug} ${source.displayName}`.toLowerCase();
  const match = ICON_MATCHERS.find((entry) =>
    entry.tokens.some((token) => haystack.includes(token)),
  );
  if (match) return match.icon;
  if (source.category === 'dev') return FolderGit2;
  if (source.category === 'storage') return Cloud;
  return PlugZap;
}

const ICON_MATCHERS: readonly {
  readonly tokens: readonly string[];
  readonly icon: LucideIcon;
}[] = [
  { tokens: ['gmail', 'outlook', 'email'], icon: Mail },
  { tokens: ['calendar'], icon: CalendarDays },
  { tokens: ['drive', 'onedrive'], icon: HardDrive },
  { tokens: ['docs'], icon: AtSign },
  { tokens: ['sheets'], icon: Table2 },
  { tokens: ['github'], icon: Github },
  { tokens: ['slack', 'teams'], icon: MessageSquare },
  {
    tokens: ['linear', 'jira', 'trello'],
    icon: KanbanSquare,
  },
  {
    tokens: ['asana', 'pipedrive'],
    icon: BriefcaseBusiness,
  },
];
