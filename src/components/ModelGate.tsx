import { useEffect, useState, type ReactNode } from 'react';
import { PHONEME_MODEL } from '../config';
import { acousticEngine } from '../services/acousticEngine';

type State =
  | { kind: 'loading'; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

const mb = (b: number) => (b / 1024 / 1024).toFixed(0);

/**
 * Blocks the app until the speech model is fully on the device.
 * First visit downloads it; later visits load it from the browser cache.
 */
export function ModelGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading', loaded: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // Ask the browser not to evict the cached model when storage gets tight.
    navigator.storage?.persist?.().catch(() => {});
    setState({ kind: 'loading', loaded: 0, total: 0 });
    acousticEngine
      .load('primary', (loaded: number, total: number) => { if (alive) setState({ kind: 'loading', loaded, total }); })
      .then(() => alive && setState({ kind: 'ready' }))
      .catch((e: Error) => alive && setState({ kind: 'error', message: e.message }));
    return () => { alive = false; };
  }, [attempt]);

  if (state.kind === 'ready') return <>{children}</>;

  const total = state.kind === 'loading' && state.total ? state.total : PHONEME_MODEL.approxDownloadMB * 1024 * 1024;
  const loaded = state.kind === 'loading' ? state.loaded : 0;
  const pct = Math.min(100, (loaded / total) * 100);
  const finishing = state.kind === 'loading' && state.total > 0 && pct >= 99.5;

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-tight">Vaani</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-soft">
          Setting up Vaani on your device. Your voice is analyzed here and never uploaded.
        </p>

        {state.kind === 'loading' && (
          <div className="mt-10" role="status" aria-live="polite">
            <div
              className="h-3 rounded-full bg-line overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-sm text-ink-soft tabular-nums">
              {finishing
                ? 'Preparing the speech model…'
                : state.total
                  ? `${mb(loaded)} of ${mb(total)} MB`
                  : `Checking for a saved copy… (about ${PHONEME_MODEL.approxDownloadMB} MB on first visit)`}
            </p>
            <p className="mt-6 text-sm text-ink-soft">This happens once. After that, Vaani works offline.</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="mt-10">
            <p className="text-base">
              The speech model didn't finish downloading: {state.message}. Check your connection and try again.
            </p>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-4 rounded-lg bg-accent px-5 py-2.5 font-bold text-on-accent hover:brightness-110"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
