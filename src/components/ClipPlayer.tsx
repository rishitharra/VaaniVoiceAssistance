import { useEffect, useRef, useState } from 'react';
import { clipUrl, type Clip } from '../services/lessonManifest';

/** Local demonstration clip, capped to [start, end], with Repeat and a linked credit. */
export function ClipPlayer({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const start = clip.start ?? 0;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    setError(false);
    const onMeta = () => { v.currentTime = Math.min(start, v.duration); };
    // Poll at frame rate: 'timeupdate' fires only ~4x/s and would overshoot the end.
    const watch = () => {
      if (clip.end !== undefined && v.currentTime >= clip.end) {
        v.pause();
        v.currentTime = clip.end;
      }
      if (!v.paused) raf = requestAnimationFrame(watch);
    };
    const onPlay = () => {
      if (clip.end !== undefined && v.currentTime >= clip.end - 0.05) v.currentTime = start;
      if (v.currentTime < start) v.currentTime = start;
      raf = requestAnimationFrame(watch);
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
    };
  }, [clip, start]);

  function repeat() {
    const v = ref.current;
    if (!v) return;
    v.currentTime = start;
    void v.play().catch(() => setError(true));
  }

  return (
    <figure>
      <video ref={ref} src={clipUrl(clip)} onError={() => setError(true)} controls playsInline preload="metadata" className="w-full rounded-lg bg-ink">
        {clip.captions && <track kind="captions" src={`${import.meta.env.BASE_URL}${clip.captions}`} srcLang="en" label="English" default />}
      </video>
      {error && <p role="alert">This video could not play. You can still practice using the articulation tip below.</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button onClick={repeat} className="rounded-lg bg-accent px-5 py-2 font-bold text-on-accent hover:brightness-110">
          ↻ Repeat clip
        </button>
        <figcaption className="text-sm text-ink-soft">
          Clip from{' '}
          <a href={clip.credit.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
            “{clip.credit.title}”
          </a>{' '}
          by {clip.credit.creator}
        </figcaption>
      </div>
    </figure>
  );
}
