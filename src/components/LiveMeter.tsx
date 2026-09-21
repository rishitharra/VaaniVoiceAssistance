import { useEffect, useRef, useState } from 'react';
import type { Recorder } from '../services/audio/recorder';

type Level = 'quiet' | 'good' | 'loud';

const LABEL: Record<Level, string> = {
  quiet: 'A little quiet. Speak up or move closer.',
  good: 'Good level',
  loud: 'Too loud. Move back a little.',
};

/** How often a new bar is added. Higher = slower scroll. */
const BAR_MS = 90;
const BAR_W = 4; // px per bar including its gap

/**
 * Calm scrolling waveform: one smoothed bar every BAR_MS drifting right to
 * left, plus level guidance. Deliberately slow, so it reads as a steady meter.
 */
export function LiveMeter({ recorder }: { recorder: Recorder }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState<Level>('good');

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const buf = new Float32Array(new ArrayBuffer(2048 * 4));
    const css = getComputedStyle(document.documentElement);
    const color = (v: string) => css.getPropertyValue(v).trim();

    const bars: number[] = [];
    let raf = 0;
    let lastBar = 0;
    let smooth = 0; // smoothed amplitude between bars
    let loud = 0; // slow average of speech level
    let clipHold = 0;
    let shown: Level = 'good';
    let lastChange = 0;

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (recorder.timeDomain(buf)) {
        let sum = 0;
        let peak = 0;
        for (const x of buf) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
        const rms = Math.sqrt(sum / buf.length);
        smooth = smooth * 0.75 + rms * 0.25;
        if (rms > 0.01) loud = loud * 0.95 + rms * 0.05;
        if (peak > 0.98) clipHold = now + 1800;

        if (now - lastBar >= BAR_MS) {
          lastBar = now;
          bars.push(smooth);
          const max = Math.ceil(w / BAR_W) + 2;
          while (bars.length > max) bars.shift();
        }

        const next: Level = now < clipHold ? 'loud' : loud > 0 && loud < 0.035 ? 'quiet' : 'good';
        if (next !== shown && now - lastChange > 1200) { shown = next; lastChange = now; setLevel(next); }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color(shown === 'good' ? '--color-teal' : '--color-practice');
      const mid = h / 2;
      bars.forEach((v, i) => {
        const x = w - (bars.length - i) * BAR_W;
        const bh = Math.max(2, Math.min(1, v * 6) * (h - 10));
        ctx.globalAlpha = 0.35 + 0.65 * (i / Math.max(1, bars.length - 1)); // older bars fade
        ctx.beginPath();
        ctx.roundRect(x, mid - bh / 2, BAR_W - 1.5, bh, 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [recorder]);

  return (
    <div className="w-full">
      <canvas ref={canvas} className="h-16 w-full rounded-xl border border-line bg-surface" aria-hidden />
      <p className={`mt-2 text-sm font-bold ${level === 'good' ? 'text-teal' : 'text-practice'}`} aria-live="polite">
        {LABEL[level]}
      </p>
    </div>
  );
}
