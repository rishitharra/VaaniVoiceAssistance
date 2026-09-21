import { useState } from 'react';

interface Props {
  hasProfile: boolean;
  onNew: () => void;
  onReturning: () => void;
}

export function WelcomeScreen({ hasProfile, onNew, onReturning }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [noSave, setNoSave] = useState(false);

  return (
    <section className="grid min-h-[75dvh] place-items-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to <span className="text-accent">Vaani</span></h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Read aloud, see which sounds to work on, and practice with sentences built for you. Everything stays on this device.
        </p>

        <div className="mt-10 grid gap-3">
          <button
            onClick={() => (hasProfile ? setConfirming(true) : onNew())}
            className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110"
          >
            New user
          </button>
          <button
            onClick={() => (hasProfile ? onReturning() : setNoSave(true))}
            className="rounded-lg border-2 border-accent px-6 py-3 text-lg font-bold text-accent hover:bg-accent hover:text-on-accent"
          >
            Returning user
          </button>
        </div>

        {confirming && (
          <div role="alert" className="mt-6 rounded-lg border border-practice/40 bg-practice/10 p-4">
            <p>Starting fresh replaces the progress saved on this device.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={onNew} className="rounded-md bg-practice px-4 py-2 font-bold text-paper">Start fresh</button>
              <button onClick={() => setConfirming(false)} className="rounded-md px-4 py-2 font-bold hover:bg-line">Keep my progress</button>
            </div>
          </div>
        )}
        {noSave && (
          <p role="status" className="mt-6 rounded-lg border border-line p-4">
            There's no saved progress in this browser. Choose New user, or import a save file from Settings (⚙).
          </p>
        )}
      </div>
    </section>
  );
}
