/**
 * CR-37 F-CR37-12: expõe `error` para que o componente possa exibir
 * feedback ao user em vez de swallow silencioso. Tipos de erro:
 * - 'mic-permission': `getUserMedia` negado
 * - 'transcribe-failed': transcrição falhou (via voice-button)
 * - 'generic': qualquer outro erro de gravação
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceRecorderState = 'idle' | 'recording' | 'too-long';

export type VoiceError = 'mic-permission' | 'transcribe-failed' | 'generic';

export interface VoiceRecorderResult {
  readonly state: VoiceRecorderState;
  readonly duration: number;
  readonly analyser: AnalyserNode | null;
  readonly error: VoiceError | null;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<Blob | null>;
  readonly cancel: () => void;
}

const MAX_DURATION_SECONDS = 60;
const TICK_MS = 250;

export function useVoiceRecorder(): VoiceRecorderResult {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [duration, setDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((blob: Blob) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) clearInterval(tickRef.current);
    tickRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((t) => {
      t.stop();
    });
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    resolveRef.current = null;
    setAnalyser(null);
    setDuration(0);
  }, []);

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    cleanup();
    setState('idle');
    setError(null);
  }, [cleanup]);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // CR-37 F-CR37-12: expor erro de permissão em vez de swallow silencioso.
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setError(isDenied ? 'mic-permission' : 'generic');
      return;
    }

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const node = audioCtx.createAnalyser();
    node.fftSize = 256;
    source.connect(node);
    audioCtxRef.current = audioCtx;
    setAnalyser(node);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const rec = new MediaRecorder(stream, { mimeType });
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.start(TICK_MS);
    setState('recording');

    let elapsed = 0;
    tickRef.current = setInterval(() => {
      elapsed += TICK_MS / 1000;
      setDuration(elapsed);
      if (elapsed >= MAX_DURATION_SECONDS) {
        setState('too-long');
      }
    }, TICK_MS);
  }, [state]);

  const stop = useCallback((): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      cleanup();
      setState('idle');
      return Promise.resolve(null);
    }
    return new Promise<Blob | null>((resolve) => {
      resolveRef.current = resolve;
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        // CR-37 F-CR37-12: verifica se resolve ainda está ativo antes de
        // chamar — cancel() pode ter limpado resolveRef antes do onstop.
        if (resolveRef.current) {
          resolveRef.current(blob);
        }
        cleanup();
        setState('idle');
      };
      rec.stop();
    });
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return { state, duration, analyser, error, start, stop, cancel };
}
