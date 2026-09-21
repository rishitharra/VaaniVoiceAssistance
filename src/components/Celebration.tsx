import { useEffect, useRef } from 'react';

export interface CelebrationData {
  title: string;
  body?: string;
  /** big = full confetti, small = a short burst */
  size: 'big' | 'small';
}

/** Confetti burst from the top plus a toast. Motion is skipped if the user prefers reduced motion. */
export function Celebration({ data, onDone }: { data: CelebrationData; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setTimeout(onDone, data.size === 'big' ? 4200 : 3000);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const c = canvas.current;
    if (reduce || !c) return () => clearTimeout(timer);

    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = ['--color-sun', '--color-teal', '--color-accent', '--color-matched'].map((v) => css.getPropertyValue(v).trim());
    const n = data.size === 'big' ? 160 : 60;
    const parts = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4,
      y: -10,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * 4 + 2,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: Math.random() * 7 + 5,
      h: Math.random() * 4 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      for (const p of parts) {
        p.vy += 0.12;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 2600) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [data, onDone]);

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden />
      <div
        role="status"
        className="fixed left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 animate-rise rounded-2xl border border-sun/60 bg-surface px-5 py-4 shadow-xl"
        style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <p className="flex items-center gap-3 text-lg font-bold">
          <span className="animate-pop text-2xl" aria-hidden>{data.size === 'big' ? '🎉' : '✨'}</span>
          {data.title}
        </p>
        {data.body && <p className="mt-1 text-ink-soft">{data.body}</p>}
      </div>
    </>
  );
}
