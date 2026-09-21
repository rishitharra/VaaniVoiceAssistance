import type { Profile, WeakSound } from '../services/profile';
import { PHONE_INFO } from '../services/phonemes/inventory';

interface Props {
  profile: Profile;
  onPractice: () => void;
  onRandom: () => void;
  onReadingCheck: () => void;
  notice?: string | null;
}

export function HomeScreen({ profile, onPractice, onRandom, onReadingCheck, notice }: Props) {
  const active = (Object.values(profile.weakSounds) as WeakSound[]).filter((w) => w.status === 'active');
  const first = profile.sessionCount === 0;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">{first ? "Let's find your sounds" : 'What next?'}</h1>
      {notice && <p role="status" className="mt-4 animate-rise rounded-xl bg-matched/15 px-4 py-3">{notice}</p>}

      <div className="mt-8 grid gap-4">
        {profile.randomPracticeUnlocked && <article className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-xl font-bold">Random practice unlocked</h2>
          <p className="mt-2">Keep practicing with a fresh mix of sentences.</p>
          <button onClick={onRandom} className="mt-4 rounded-lg bg-accent px-6 py-3 font-bold text-on-accent">Start random practice</button>
        </article>}
        {active.length > 0 && (
          <article className="rounded-2xl border border-line border-t-4 border-t-teal bg-surface p-6">
            <h2 className="text-xl font-bold">Practice set</h2>
            <p className="mt-1 text-ink-soft">Fresh sentences packed with the sounds you're working on.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {active.map((w) => (
                <li key={w.phone} className="rounded-full bg-practice/15 px-3 py-1">
                  <b>/{PHONE_INFO[w.phone].ipa}/</b> <span className="text-ink-soft">{PHONE_INFO[w.phone].example}</span>
                </li>
              ))}
            </ul>
            <button onClick={onPractice} className="mt-5 rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110">
              Practice my sounds
            </button>
          </article>
        )}

        <article className={`rounded-2xl border border-line border-t-4 ${active.length ? 'border-t-accent' : 'border-t-sun'} bg-surface p-6`}>
          <h2 className="text-xl font-bold">Reading check</h2>
          <p className="mt-1 text-ink-soft">
            {first
              ? 'Read one paragraph aloud. It covers the sounds Vaani supports, so Vaani can see where to focus.'
              : 'Read the full paragraph again to look for new sounds and confirm your progress.'}
          </p>
          <button
            onClick={onReadingCheck}
            className={active.length
              ? 'mt-5 rounded-lg border-2 border-accent px-6 py-3 text-lg font-bold text-accent hover:bg-accent hover:text-on-accent'
              : 'mt-5 rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110'}
          >
            {first ? 'Start the reading check' : 'Take the reading check'}
          </button>
        </article>
      </div>
    </section>
  );
}
