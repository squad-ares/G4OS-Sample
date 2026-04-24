import { useEffect, useRef } from 'react';

interface WaveformProps {
  readonly analyser: AnalyserNode;
  readonly className?: string;
}

const BAR_COUNT = 24;
const BAR_GAP = 2;

export function Waveform({ analyser, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!canvas || !ctx) return;
      analyser.getByteFrequencyData(buffer);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barW = (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const step = Math.floor(buffer.length / BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = buffer[i * step] ?? 0;
        const barH = Math.max(3, (value / 255) * h);
        const x = i * (barW + BAR_GAP);
        const y = (h - barH) / 2;

        ctx.fillStyle = `rgba(239,68,68,${0.4 + (value / 255) * 0.6})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [analyser]);

  return <canvas ref={canvasRef} width={96} height={28} className={className} />;
}
