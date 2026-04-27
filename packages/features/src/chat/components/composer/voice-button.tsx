import { cn, useTranslate } from '@g4os/ui';
import { Mic, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useVoiceRecorder } from '../../hooks/use-voice-recorder.ts';
import { Waveform } from './waveform.tsx';

export interface VoiceButtonProps {
  readonly onTranscript: (text: string) => void;
  readonly transcribe: (audio: Uint8Array, mimeType: string) => Promise<string>;
  readonly disabled?: boolean;
  readonly className?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function VoiceButton({ onTranscript, transcribe, disabled, className }: VoiceButtonProps) {
  const { t } = useTranslate();
  const { state, duration, analyser, start, stop, cancel } = useVoiceRecorder();

  const isRecording = state === 'recording' || state === 'too-long';

  const handleStop = useCallback(async () => {
    const blob = await stop();
    if (!blob) return;
    const buf = await blob.arrayBuffer();
    const text = await transcribe(new Uint8Array(buf), blob.type);
    if (text.trim()) onTranscript(text.trim());
  }, [stop, transcribe, onTranscript]);

  useEffect(() => {
    if (state === 'too-long') void handleStop();
  }, [state, handleStop]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isRecording) {
        e.preventDefault();
        cancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRecording, cancel]);

  if (isRecording) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {analyser && <Waveform analyser={analyser} />}
        <span className="font-mono text-[10px] tabular-nums text-destructive">
          {formatDuration(duration)}
        </span>
        {state === 'too-long' && (
          <span className="text-[10px] font-medium text-destructive" role="alert">
            {t('chat.composer.voice.maxDuration')}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleStop()}
          aria-label={t('chat.composer.voice.ariaLabel')}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
        >
          <Mic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label={t('chat.composer.voice.cancelAriaLabel')}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={disabled}
      aria-label={t('chat.composer.voice.ariaLabel')}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground disabled:opacity-40',
        className,
      )}
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
