import { ARTICULATION, WORD_NOTES } from '../services/coaching';
import { LESSONS } from '../services/lessonManifest';
import { PHONE_INFO, type Phone } from '../services/phonemes/inventory';
import { ClipPlayer } from './ClipPlayer';

interface Props {
  /** Sounds confirmed in this session, with the words they were flagged in */
  sounds: { phone: Phone; words: string[] }[];
  onPractice: () => void;
  onHome: () => void;
}

export function PronunciationCoach({ sounds, onPractice, onHome }: Props) {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Sounds to practice</h1>
      <p className="mt-2 text-lg text-ink-soft">Use the tips and any available clips, then try the words out loud. Repeat as often as you like.</p>

      <div className="mt-10 space-y-12">
        {sounds.map(({ phone, words }) => {
          const info = PHONE_INFO[phone];
          const clip = LESSONS[phone];
          return (
            <article key={phone} aria-labelledby={`h-${phone}`}>
              <h2 id={`h-${phone}`} className="text-2xl font-bold">
                /{info.ipa}/ <span className="font-normal text-ink-soft">as in “{info.example}”</span>
              </h2>
              <p className="mt-1 text-ink-soft">Flagged in: {words.join(', ')}</p>
              <div className="mt-4">
                {clip?.src ? (
                  <ClipPlayer clip={clip} />
                ) : (
                  <div className="rounded-lg border border-line bg-surface p-6 text-ink-soft">
                    Practice /{info.ipa}/ in “{info.example}”. Say it slowly, then use it in a flowing phrase.
                  </div>
                )}
                <p className="mt-3">{clip?.tip || ARTICULATION[phone]}</p>
                {words.filter(w => WORD_NOTES[w.toLowerCase()]).map(w => <p key={w} className="mt-2 text-ink-soft">{w}: {WORD_NOTES[w.toLowerCase()]}</p>)}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <button onClick={onPractice} className="rounded-lg bg-accent px-6 py-3 text-lg font-bold text-on-accent hover:brightness-110">
          Practice these sounds
        </button>
        <button onClick={onHome} className="rounded-lg px-5 py-3 font-bold hover:bg-line">Back to home</button>
      </div>
    </section>
  );
}
