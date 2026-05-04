/**
 * Inline badge parser e renderers pra user messages.
 *
 * Reconhece 4 padrões dentro do texto da user message:
 *
 *   1. `/command`           → CommandBadge (gradient, slash commands tipo `/setup`).
 *   2. `[file:path]`        → FileBadge (clickable, hover bg).
 *   3. `[source:slug]`      → SourceBadge (accent pill — referência de source).
 *   4. `@<mention>`         → MentionBadge (accent, partial-color matching V1).
 *
 * Tipo do match preserva start/end pra detecção de overlap (sem suportar
 * — primeiro match wins). Se nenhum match: retorna `null` e o caller cai
 * pro MarkdownRenderer puro.
 *
 * V1 reference: `packages/ui/src/components/chat/UserMessageBubble.tsx`
 * lines 551-602 (renderContentWithBadges + InlineBadge variants).
 */

import { cn } from '@g4os/ui';
import { Hash } from 'lucide-react';
import type { ReactNode } from 'react';

interface BadgeMatch {
  readonly type: 'command' | 'file' | 'source' | 'mention';
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly raw: string;
}

const BADGE_PATTERNS: ReadonlyArray<{
  readonly type: BadgeMatch['type'];
  readonly regex: RegExp;
}> = [
  // /command — só no início de linha ou após whitespace, palavra alfanumérica
  { type: 'command', regex: /(?:^|\s)(\/[a-z][a-z0-9-]{1,40})\b/g },
  // [file:path] — markdown-like marker
  { type: 'file', regex: /\[file:([^\]]+)\]/g },
  // [source:slug] — managed source reference
  { type: 'source', regex: /\[source:([a-z0-9-]+)\]/g },
  // @mention — alphanumeric + dash, mínimo 2 chars; só em start ou após whitespace
  { type: 'mention', regex: /(?:^|\s)(@[a-z][a-z0-9-]{1,40})\b/gi },
];

function findMatches(content: string): BadgeMatch[] {
  const results: BadgeMatch[] = [];
  for (const { type, regex } of BADGE_PATTERNS) {
    // Reset lastIndex pra cada execução; regex global mantém estado.
    regex.lastIndex = 0;
    let m: RegExpExecArray | null = regex.exec(content);
    while (m !== null) {
      // Em `command`/`mention`, captura `(/cmd)` ou `(@x)` em group 1; o
      // match completo pode incluir whitespace prefix. Usar `m.index +
      // (m[0].length - m[1].length)` como start real.
      const captured = m[1] ?? m[0];
      const offset = m[0].indexOf(captured);
      const start = m.index + offset;
      const end = start + captured.length;
      const label = type === 'file' || type === 'source' ? (m[1] ?? '') : captured;
      results.push({ type, start, end, label, raw: m[0] });
      m = regex.exec(content);
    }
  }
  // Ordena por start, descarta overlaps (primeiro venceu).
  results.sort((a, b) => a.start - b.start);
  const filtered: BadgeMatch[] = [];
  let cursor = 0;
  for (const r of results) {
    if (r.start < cursor) continue;
    filtered.push(r);
    cursor = r.end;
  }
  return filtered;
}

/**
 * Renderiza conteúdo intercalando badges. Retorna `null` se não há
 * nenhum match — caller deve usar fallback (markdown puro).
 */
export function renderUserContentWithBadges(content: string): ReactNode | null {
  const matches = findMatches(content);
  if (matches.length === 0) return null;

  const elements: ReactNode[] = [];
  let lastEnd = 0;
  matches.forEach((badge, i) => {
    if (badge.start > lastEnd) {
      const before = content.slice(lastEnd, badge.start);
      if (before) {
        elements.push(
          <span key={`text-${i}`} className="whitespace-pre-wrap">
            {before}
          </span>,
        );
      }
    }
    elements.push(<InlineBadge key={`badge-${i}`} match={badge} />);
    lastEnd = badge.end;
  });

  if (lastEnd < content.length) {
    const tail = content.slice(lastEnd);
    if (tail) {
      elements.push(
        <span key="text-end" className="whitespace-pre-wrap">
          {tail}
        </span>,
      );
    }
  }

  // V1 usa `text-sm leading-[2]` quando há badges (linha mais alta pra
  // não comprimir as pílulas verticalmente).
  return <p className="text-sm leading-[2]">{elements}</p>;
}

interface InlineBadgeProps {
  readonly match: BadgeMatch;
}

function InlineBadge({ match }: InlineBadgeProps) {
  const baseClass =
    'inline-flex items-center gap-1 h-[22px] px-1.5 mx-0.5 rounded-[5px] text-[12px] font-medium align-middle';

  if (match.type === 'command') {
    // Gradient pill — V1 usa via shadow-tinted gradient blue→purple→pink.
    return (
      <span
        className={cn(
          baseClass,
          'bg-gradient-to-r from-blue-600/15 via-purple-600/15 to-pink-600/15 text-foreground/90',
        )}
      >
        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent font-semibold">
          {match.label}
        </span>
      </span>
    );
  }

  if (match.type === 'file') {
    return (
      <span
        className={cn(
          baseClass,
          'bg-foreground/[0.06] text-foreground/85 hover:bg-accent/15 transition-colors',
        )}
      >
        <Hash className="h-[10px] w-[10px] shrink-0 text-muted-foreground" aria-hidden={true} />
        <span className="max-w-[200px] truncate">{match.label}</span>
      </span>
    );
  }

  if (match.type === 'source') {
    return (
      <span className={cn(baseClass, 'bg-accent/20 text-accent')}>
        <span className="flex h-[12px] w-[12px] shrink-0 items-center justify-center rounded-[2px] bg-accent/25 text-[10px] font-medium">
          @
        </span>
        <span className="max-w-[200px] truncate">{match.label}</span>
      </span>
    );
  }

  // mention
  return (
    <span className={cn(baseClass, 'bg-accent/15 text-accent')}>
      <span className="max-w-[200px] truncate">{match.label}</span>
    </span>
  );
}
