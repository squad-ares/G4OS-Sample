/**
 * Typeahead de menções disparadas por `@` no composer.
 *
 * Scope OUTLIER-20 MVP: não migra pra editor rich (contenteditable/Lexical).
 * Em vez disso:
 *   1. Detecta quando o usuário digita `@` (em start ou após whitespace)
 *   2. Lê o `query` depois do `@` até o próximo whitespace/quebra
 *   3. Expõe state + helpers (`replaceWith`, `cancel`)
 *   4. O caller (`Composer`) renderiza o popover ancorado ao caret
 *
 * A inserção ao selecionar substitui `@query` pelo marker plain-text
 * `[source:slug] ` — o backend já parseia esses markers via
 * `SourceIntentDetector` (OUTLIER-10). Quando um editor rich for
 * adotado, o marker vira content block estruturado (chip).
 */

import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';

export interface MentionTypeaheadOptions {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export interface MentionTrigger {
  /** Posição do `@` no texto. */
  readonly start: number;
  /** Posição imediatamente após o `@` (onde o query começa). */
  readonly queryStart: number;
  /** Fim do query (próximo whitespace/EOL ou cursor atual). */
  readonly queryEnd: number;
  /** Query digitado (sem o `@`). */
  readonly query: string;
}

export interface MentionTypeaheadResult {
  readonly trigger: MentionTrigger | null;
  /** Insere texto substituindo `@query` atual, mais espaço final. Usar para `[source:slug]`. */
  readonly replaceWith: (inserted: string) => void;
  /** Cancela o typeahead sem alterar texto. */
  readonly cancel: () => void;
}

export function useMentionTypeahead(options: MentionTypeaheadOptions): MentionTypeaheadResult {
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

  // Reset cancel quando o usuário move/edita a parte com `@`. `value`
  // é o gatilho intencional — corpo não precisa referenciá-lo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the intentional reset trigger
  useEffect(() => {
    setCancelled(false);
  }, [value]);

  const trigger = useMemo<MentionTrigger | null>(() => {
    if (cancelled) return null;
    return detectTrigger(value, cursor);
  }, [value, cursor, cancelled]);

  const replaceWith = useCallback(
    (inserted: string) => {
      if (!trigger) return;
      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.queryEnd);
      const needsSpace = after.length === 0 || !after.startsWith(' ');
      const next = `${before}${inserted}${needsSpace ? ' ' : ''}${after}`;
      onChange(next);
      // Reposiciona cursor após o inserido + espaço.
      const nextCursor = before.length + inserted.length + (needsSpace ? 1 : 0);
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
 * Detecta se há um `@` ativo antes do cursor. Regras:
 *  - `@` precisa estar no começo do texto OU precedido por whitespace.
 *  - Query vai do char após `@` até o próximo whitespace/EOL (ou cursor).
 *  - Query não pode conter `@` (encerra trigger).
 *  - Se query passa de 50 chars, abortar — provavelmente não é menção.
 */
export function detectTrigger(value: string, cursor: number): MentionTrigger | null {
  if (cursor <= 0) return null;
  // Walk backwards from cursor to find nearest `@` or whitespace/start.
  let atIdx = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === '@') {
      atIdx = i;
      break;
    }
    if (ch === ' ' || ch === '\n' || ch === '\t') return null;
    if (cursor - i > 50) return null;
  }
  if (atIdx < 0) return null;
  // `@` precisa estar no start ou precedido por whitespace.
  if (atIdx > 0) {
    const prev = value[atIdx - 1];
    if (prev !== ' ' && prev !== '\n' && prev !== '\t') return null;
  }
  const queryStart = atIdx + 1;
  // queryEnd = cursor (só considera texto até o cursor — ignora o que vem depois).
  const queryEnd = cursor;
  const query = value.slice(queryStart, queryEnd);
  if (query.includes('@')) return null;
  return { start: atIdx, queryStart, queryEnd, query };
}
