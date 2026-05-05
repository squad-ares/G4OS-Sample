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
// Taxa máxima de drenagem por frame — garante streaming visível mesmo quando
// o LLM é rápido e o buffer acumula. Sem esse cap, um buffer de 3 000 chars
// drena em ~30 frames (0.5s): parece que o texto "aparece de uma vez".
// Com o cap de 15 chars/frame @ 60fps = 900 chars/s — o usuário consegue
// acompanhar o texto sendo escrito em tempo real.
const MAX_CHARS_PER_FRAME = 15;
// Taxa mínima — evita "stutter" nas primeiras letras quando o buffer é
// pequeno. Sem esse piso, `ceil(N/30) = 1` para N ≤ 30, drenando 1 char por
// frame (60 chars/s). O usuário vê as 2 primeiras letras "engasgando" antes
// do buffer acumular o suficiente para drain rate acelerar. Com piso de
// 3 chars/frame @ 60fps = 180 chars/s no início — fluido desde a primeira
// letra. Quando o LLM streama devagar e o buffer fica < 3, drena tudo de uma
// vez (`Math.min(buffered.length, perFrame)`) — segue cadência natural.
const MIN_CHARS_PER_FRAME = 3;
// Warmup — acumula silenciosamente os primeiros chars antes de iniciar o
// drain. Modelos de IA tipicamente enviam o primeiro chunk muito pequeno
// (1-2 chars) e fazem uma pausa de 100-300ms antes do segundo chunk —
// "warming up". Sem warmup, o usuário vê "H" + cursor pulsing parado por
// 200ms (parece travado), depois o resto streama suave. Com warmup, o
// ghost mantém os "thinking dots" visíveis até acumular o suficiente,
// e o drain começa direto numa cadência fluida. `flush()` no `turn.done`
// renderiza qualquer chunk pré-warmup (ex.: resposta curta tipo "Sim").
const WARMUP_CHARS = 8;
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
  // Flag de warmup — true após o primeiro drain ou flush; reset() volta
  // para false. Enquanto false, `append` acumula silenciosamente sem
  // agendar RAF até `bufferRef.length >= WARMUP_CHARS`.
  const drainStartedRef = useRef(false);

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
    const natural = Math.max(1, Math.ceil(buffered.length / DRAIN_FRAMES_TARGET));
    const clamped = Math.min(MAX_CHARS_PER_FRAME, Math.max(MIN_CHARS_PER_FRAME, natural));
    const drain = Math.min(buffered.length, clamped);
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
        drainStartedRef.current = true;
        const full = bufferRef.current;
        bufferRef.current = '';
        setText((prev) => prev + full);
      }
      // Warmup gate: enquanto `drainStartedRef` é false E o buffer ainda
      // não atingiu `WARMUP_CHARS`, acumula sem agendar RAF — ghost mantém
      // os "thinking dots" e a primeira aparição de texto fica fluida.
      if (!drainStartedRef.current && bufferRef.current.length < WARMUP_CHARS) {
        return;
      }
      drainStartedRef.current = true;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  const flush = useCallback((): void => {
    cancelRaf();
    // Permite drain de respostas curtas que nunca atingiram o warmup
    // threshold (ex.: "Sim", "OK") — `turn.done` chama flush e queremos
    // o conteúdo visível.
    drainStartedRef.current = true;
    if (bufferRef.current.length > 0) {
      const remaining = bufferRef.current;
      bufferRef.current = '';
      setText((prev) => prev + remaining);
    }
  }, [cancelRaf]);

  const reset = useCallback((): void => {
    cancelRaf();
    bufferRef.current = '';
    drainStartedRef.current = false;
    setText('');
  }, [cancelRaf]);

  useEffect(() => {
    return () => {
      cancelRaf();
    };
  }, [cancelRaf]);

  return { text, append, flush, reset };
}
