/**
 * GlobalSearch — command palette (Cmd/Ctrl+K) que busca sessões e mensagens
 * no workspace ativo. Lista dois grupos: `Sessões` (match por nome) e
 * `Mensagens` (match por conteúdo, via FTS5).
 *
 * Componente headless: recebe `results` + `isOpen`; o fetch é coordenado
 * pelo consumidor (tipicamente um hook que faz debounce e chama o tRPC).
 */

import type { GlobalSearchResult } from '@g4os/kernel/types';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  useTranslate,
} from '@g4os/ui';

export interface GlobalSearchProps {
  readonly open: boolean;
  readonly query: string;
  readonly results: GlobalSearchResult | null;
  readonly onQueryChange: (next: string) => void;
  readonly onOpenChange: (next: boolean) => void;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onSelectMessage: (sessionId: string, sequence: number) => void;
}

export function GlobalSearch({
  open,
  query,
  results,
  onQueryChange,
  onOpenChange,
  onSelectSession,
  onSelectMessage,
}: GlobalSearchProps) {
  const { t } = useTranslate();

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={onQueryChange}
        placeholder={t('session.search.placeholder')}
      />
      <CommandList>
        {query.trim().length === 0 ? (
          <CommandEmpty>{t('session.search.emptyDescription')}</CommandEmpty>
        ) : results && results.messages.length === 0 && results.sessions.length === 0 ? (
          <CommandEmpty>{t('session.search.noResults')}</CommandEmpty>
        ) : null}

        {results && results.sessions.length > 0 ? (
          <CommandGroup heading={t('session.search.group.sessions')}>
            {results.sessions.map((session) => (
              <CommandItem
                key={`session:${session.id}`}
                value={`session:${session.id}:${session.name}`}
                onSelect={() => {
                  onSelectSession(session.id);
                  onOpenChange(false);
                }}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{session.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && results.messages.length > 0 ? (
          <CommandGroup heading={t('session.search.group.messages')}>
            {results.messages.map((hit) => (
              <CommandItem
                key={`message:${hit.messageId}`}
                value={`message:${hit.messageId}:${hit.snippet}`}
                onSelect={() => {
                  onSelectMessage(hit.sessionId, hit.sequence);
                  onOpenChange(false);
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{hit.sessionName}</span>
                  <span
                    className="text-xs text-muted-foreground truncate"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: (reason: snippet vem de FTS5 SQLite com <mark>...</mark> apenas; nenhum HTML do usuário é injetado)
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
