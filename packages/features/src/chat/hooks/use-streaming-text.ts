/**
 * useStreamingText — buffer de texto com renderização em 60fps.
 *
 * Chunks que chegam do LLM via `turn.text_chunk` são acumulados num buffer
 * interno e drenados a cada animation frame (~16ms). Cada frame consome
 * um pedaço proporcional ao tamanho do buffer (alvo: drenar todo o buffer
 * em ~0.5s), garantindo que streaming rápido ainda apareça gradualmente
 * sem ficar artificialmente lento em respostas longas.
 *
 * `flush()` drena tudo imediatamente — usar ao receber `turn.done` para
 * que o usuário veja a resposta final sem atraso residual.
 * `reset()` limpa buffer e texto — usar ao iniciar um novo turn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const DRAIN_FRAMES_TARGET = 30;
// Cap do buffer para não acumular sem limite quando a tab está hidden.
// requestAnimationFrame não dispara em tab oculta, mas `append` continua
// chegando (resposta longa do LLM); ao retornar, drenar MB de texto trava
// UI por dezenas de frames. Cap de 512KB preserva contexto recente.
const MAX_BUFFER_SIZE = 512_000;

export interface UseStreamingTextResult {
  readonly text: string;
  readonly append: (chunk: string) => void;
  readonly flush: () => void;
  readonly reset: () => void;
}

export function useStreamingText(): UseStreamingTextResult {
  const [text, setText] = useState('');
  const bufferRef = useRef('');
  const rafRef = useRef<number | null>(null);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback((): void => {
    const buffered = bufferRef.current;
    if (buffered.length === 0) {
      rafRef.current = null;
      return;
    }
    const perFrame = Math.max(1, Math.ceil(buffered.length / DRAIN_FRAMES_TARGET));
    const drain = Math.min(buffered.length, perFrame);
    const slice = buffered.slice(0, drain);
    bufferRef.current = buffered.slice(drain);
    setText((prev) => prev + slice);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const append = useCallback(
    (chunk: string): void => {
      if (chunk.length === 0) return;
      bufferRef.current += chunk;
      // CR-37 F-CR37-8: quando o buffer excede o cap (tab oculta: rAF não
      // dispara e o stream continua chegando), drena tudo imediatamente para
      // o state em vez de fatiar pelo final. Antes: `slice(-MAX_BUFFER_SIZE)`
      // descartava o início do buffer que nunca foi renderizado — causando
      // resposta truncada para o usuário ao voltar à aba.
      if (bufferRef.current.length > MAX_BUFFER_SIZE) {
        const full = bufferRef.current;
        bufferRef.current = '';
        setText((prev) => prev + full);
      }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  const flush = useCallback((): void => {
    cancelRaf();
    if (bufferRef.current.length > 0) {
      const remaining = bufferRef.current;
      bufferRef.current = '';
      setText((prev) => prev + remaining);
    }
  }, [cancelRaf]);

  const reset = useCallback((): void => {
    cancelRaf();
    bufferRef.current = '';
    setText('');
  }, [cancelRaf]);

  useEffect(() => {
    return () => {
      cancelRaf();
    };
  }, [cancelRaf]);

  return { text, append, flush, reset };
}
