/**
 * Typeahead de slash commands disparados por `/` no início da mensagem.
 *
 * Diferente do `@mention` (que pode aparecer em qualquer ponto após
 * whitespace), `/command` só dispara quando o `/` está na **primeira
 * posição** do textarea. Isso reflete a convenção V1 e a maioria dos
 * chat UIs com slash commands (Slack, Discord, ChatGPT) — slash no meio
 * de texto é caractere literal (path, regex, etc.).
 *
 * Mecânica idêntica ao `useMentionTypeahead`:
 *   1. Detecta `/` na posição 0
 *   2. Lê query até o cursor (sem incluir whitespace)
 *   3. Caller renderiza popover ancorado, recebe `replaceWith` pra
 *      substituir `/query` pelo command escolhido + espaço.
 */

import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';

export interface SlashTypeaheadOptions {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export interface SlashTrigger {
  /** Posição do `/` no texto (sempre 0). */
  readonly start: number;
  /** Posição após o `/` (queryStart === 1). */
  readonly queryStart: number;
  /** Fim do query (cursor atual ou próximo whitespace). */
  readonly queryEnd: number;
  /** Query digitado (sem o `/`). */
  readonly query: string;
}

export interface SlashTypeaheadResult {
  readonly trigger: SlashTrigger | null;
  /** Substitui `/query` atual por `command` + espaço final. */
  readonly replaceWith: (command: string) => void;
  /** Cancela o typeahead sem alterar texto. */
  readonly cancel: () => void;
}

export function useSlashTypeahead(options: SlashTypeaheadOptions): SlashTypeaheadResult {
  const { value, onChange, textareaRef } = options;
  const [cursor, setCursor] = useState(0);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const updateCursor = (): void => setCursor(el.selectionStart ?? 0);
    el.addEventListener('keyup', updateCursor);
    el.addEventListener('click', updateCursor);
    el.addEventListener('select', updateCursor);
    return () => {
      el.removeEventListener('keyup', updateCursor);
      el.removeEventListener('click', updateCursor);
      el.removeEventListener('select', updateCursor);
    };
  }, [textareaRef]);

  // Reset cancel quando o texto muda (user editou) — `value` é o trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the intentional reset trigger
  useEffect(() => {
    setCancelled(false);
  }, [value]);

  const trigger = useMemo<SlashTrigger | null>(() => {
    if (cancelled) return null;
    return detectSlashTrigger(value, cursor);
  }, [value, cursor, cancelled]);

  const replaceWith = useCallback(
    (command: string) => {
      if (!trigger) return;
      const after = value.slice(trigger.queryEnd);
      const needsSpace = after.length === 0 || !after.startsWith(' ');
      const next = `${command}${needsSpace ? ' ' : ''}${after}`;
      onChange(next);
      const nextCursor = command.length + (needsSpace ? 1 : 0);
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [trigger, value, onChange, textareaRef],
  );

  const cancel = useCallback(() => {
    setCancelled(true);
  }, []);

  return { trigger, replaceWith, cancel };
}

/**
 * Detecta se há `/` ativo na posição 0 e cursor está dentro do query.
 *  - `/` precisa estar em value[0].
 *  - Query vai de value[1] até o cursor, parando em whitespace.
 *  - Query >40 chars aborta (não é command).
 */
export function detectSlashTrigger(value: string, cursor: number): SlashTrigger | null {
  if (value.length === 0 || value[0] !== '/') return null;
  if (cursor < 1) return null;
  // Query termina no primeiro whitespace ou no cursor (o que vier antes).
  let queryEnd = cursor;
  for (let i = 1; i < cursor; i++) {
    const ch = value[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      // Cursor está depois do whitespace — typeahead já foi consumido.
      if (i < cursor) return null;
      queryEnd = i;
      break;
    }
  }
  const query = value.slice(1, queryEnd);
  if (query.length > 40) return null;
  return { start: 0, queryStart: 1, queryEnd, query };
}
